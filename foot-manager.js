import {randomInt, randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

// Optional PostgreSQL persistence for Render (DATABASE_URL); local JSON is development-only.
export function mountFootManager(app, io) {
  let db={leagues:{}};
  let pool=null;
  let writes=Promise.resolve();
  const file=process.env.FOOT_DATA_FILE || path.resolve('foot-data.json');
  const ready=(async()=>{
    if(process.env.DATABASE_URL){
      pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('localhost')?false:{rejectUnauthorized:false}});
      await pool.query('CREATE TABLE IF NOT EXISTS foot_manager_store (id text PRIMARY KEY, data jsonb NOT NULL)');
      const result=await pool.query('SELECT data FROM foot_manager_store WHERE id=$1',['main']);
      if(result.rows[0]?.data) db=result.rows[0].data;
    }else{
      try{db=JSON.parse(await fs.readFile(file,'utf8'));}catch(err){if(err.code!=='ENOENT')throw err;}
    }
  })();
  function save(){
    const snapshot=JSON.stringify(db);
    writes=writes.then(async()=>{
      if(pool)await pool.query('INSERT INTO foot_manager_store(id,data) VALUES($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data',['main',snapshot]);
      else {const temp=file+'.tmp';await fs.writeFile(temp,snapshot);await fs.rename(temp,file);}
    });
    return writes;
  }
  function clean(x,n=24){return String(x??'').trim().replace(/[<>\u0000-\u001f]/g,'').slice(0,n)}
  function fail(res,status,error){res.status(status).json({ok:false,error});}
  const positions=['G','D','M','A'];
  const roster=()=>[...Array.from({length:2},(_,i)=>({id:randomUUID(),name:`Gardien Académie ${i+1}`,position:'G',rating:65,starter:true})),...Array.from({length:5},(_,i)=>({id:randomUUID(),name:`Défenseur Académie ${i+1}`,position:'D',rating:65,starter:true})),...Array.from({length:5},(_,i)=>({id:randomUUID(),name:`Milieu Académie ${i+1}`,position:'M',rating:65,starter:true})),...Array.from({length:3},(_,i)=>({id:randomUUID(),name:`Attaquant Académie ${i+1}`,position:'A',rating:65,starter:true}))].map((p,i)=>({...p,starter:i<11}));
  // Starter selection cross-checked against PSG 2026/27 and Marseille 2026/27 squads.
  // In-game ratings and virtual prices are game design, NOT market valuations.
  const featured=[
    ['Lucas Chevalier','PSG','G',200000,84],['Matvei Safonov','PSG','G',85000,77],
    ['Achraf Hakimi','PSG','D',350000,89],['Marquinhos','PSG','D',180000,83],
    ['Lucas Beraldo','PSG','D',85000,76],['Illia Zabarnyi','PSG','D',120000,80],
    ['Lucas Hernández','PSG','D',115000,81],['Lucas Digne','PSG','D',75000,76],
    ['João Neves','PSG','M',285000,87],['Vitinha','PSG','M',320000,89],
    ['Warren Zaïre-Emery','PSG','M',190000,84],
    ['Ousmane Dembélé','PSG','A',350000,90],['Khvicha Kvaratskhelia','PSG','A',325000,88],
    ['Désiré Doué','PSG','A',295000,87],['Bradley Barcola','PSG','A',240000,85],
    ['Ferran Torres','PSG','A',230000,85],['Mika Godts','PSG','A',135000,79],
    ['Jeffrey de Lange','Marseille','G',50000,72],['Facundo Medina','Marseille','D',150000,81],
    ['Timothy Weah','Marseille','D',130000,80],['Angel Gomes','Marseille','M',125000,79],
    ['Hamed Traorè','Marseille','M',110000,78],['Himad Abdelli','Marseille','M',75000,74]
  ];
  const starterMarket=featured.map(([name,club,position,value,rating])=>({id:randomUUID(),name,club,position,value,rating,source:'selection-2026-11',owner:null}));
  function pairings(teams,round){
    const ids=teams.map(t=>t.id); if(ids.length%2)ids.push(null);
    const n=ids.length; if(n<2)return [];
    const arr=[ids[0],...ids.slice(1)];let games=[];
    for(let r=0;r<Math.max(0,round);r++){
      if(r>0)arr.splice(1,0,arr.pop());
      games=[];for(let i=0;i<n/2;i++)if(arr[i]&&arr[n-i-1])games.push([arr[i],arr[n-i-1]]);
    }return games;
  }
  async function provider(endpoint,params={}){
    if(!process.env.API_FOOTBALL_KEY)throw Error('Ajoute API_FOOTBALL_KEY dans les variables Render pour importer les données Ligue 1.');
    const u=new URL('https://v3.football.api-sports.io/'+endpoint);
    for(const [key,val] of Object.entries(params))u.searchParams.set(key,String(val));
    const r=await fetch(u,{headers:{'x-apisports-key':process.env.API_FOOTBALL_KEY},signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw Error('Source football indisponible ('+r.status+').');
    const d=await r.json();if(d.errors&&Object.keys(d.errors).length)throw Error('API Football : '+JSON.stringify(d.errors).slice(0,180));return d.response||[];
  }
  // Upgrade leagues created by the earlier demo without resetting clubs or budgets.
  ready.then(async()=>{
    let changed=false;
    for(const l of Object.values(db.leagues)){
      l.market ||= [];
      const before=l.market.length;
      // Keep already purchased demo players, but remove unsold fictional market placeholders.
      l.market=l.market.filter(p=>p.source!=='fictional'||p.owner);
      for(const p of starterMarket)if(!l.market.some(x=>x.name===p.name&&x.club===p.club))l.market.push({...p,id:randomUUID()});
      if(l.market.length!==before)changed=true;
      l.catalogDate ||= 'Sélection novembre 2026';
      l.fixtures ||= [];
    }
    if(changed)await save();
  }).catch(err=>console.error('[Foot migration]',err));
  const own=(league,token)=>league.teams.find(t=>t.token===token);
  function publicLeague(l,token){
    const me=own(l,token);
    return {ok:true,code:l.code,name:l.name,host:me?.id===l.teams[0].id,me:me?.id,persistence:pool?'postgres':'local-ephemeral',teams:l.teams.map(t=>({id:t.id,name:t.name,manager:t.manager,budget:t.budget,wins:t.wins,draws:t.draws,losses:t.losses,points:t.points,roster:t.id===me?.id?t.roster.map(p=>({id:p.id,name:p.name,club:p.club||null,position:p.position,rating:p.rating,starter:p.starter,source:p.source??'academy'})):undefined,playerCount:t.roster.length})),market:l.market,fixtures:l.fixtures||[],providerReady:Boolean(process.env.API_FOOTBALL_KEY),catalogDate:l.catalogDate||null,auction:l.auction?{...l.auction,highBidder:l.teams.find(t=>t.id===l.auction.highBidder)?.name??null}:null,history:l.history.slice(-18).reverse(),matchdays:l.matchdays.slice(-10).reverse()};
  }
  function auth(req,res){const l=db.leagues[clean(req.params.code,6)];const t=l&&own(l,req.get('x-foot-token'));if(!l||!t){fail(res,403,'Ligue ou session introuvable.');return null;}return {l,t};}
  const s=(fn)=>async(req,res)=>{try{await ready;await fn(req,res)}catch(e){console.error('[Foot Manager]',e);if(!res.headersSent)fail(res,500,'Erreur serveur.')}};
  const emit=(l)=>io.to(`foot:${l.code}`).emit('foot:changed',{code:l.code});
  app.get('/api/foot/status',s(async(req,res)=>res.json({ok:true,persistence:pool?'postgres':'local-ephemeral',automatedLigue1Stats:false})));
  app.post('/api/foot/create',s(async(req,res)=>{
    const manager=clean(req.body?.manager),name=clean(req.body?.name);if(!manager||!name)return fail(res,400,'Nom de club et pseudo obligatoires.');
    let code;do{code=String(randomInt(100000,1000000))}while(db.leagues[code]);
    const token=randomUUID(),team={id:randomUUID(),token,manager,name,budget:1000000,wins:0,draws:0,losses:0,points:0,roster:roster()};
    db.leagues[code]={code,name:'Ligue privée',teams:[team],market:structuredClone(starterMarket).map(p=>({...p,id:randomUUID()})),fixtures:[],catalogDate:'Sélection novembre 2026',auction:null,history:[],matchdays:[],createdAt:Date.now()};await save();res.json({ok:true,code,token});
  }));
  app.post('/api/foot/join',s(async(req,res)=>{
    const code=clean(req.body?.code,6),manager=clean(req.body?.manager),name=clean(req.body?.name),l=db.leagues[code];
    if(!/^\d{6}$/.test(code)||!l)return fail(res,404,'Code de ligue inconnu.');
    if(!manager||!name)return fail(res,400,'Pseudo et club obligatoires.');
    if(l.teams.length>=10)return fail(res,400,'Ligue complète (10 clubs).');
    if(l.teams.some(t=>t.name.toLowerCase()===name.toLowerCase()))return fail(res,400,'Nom de club déjà pris.');
    const token=randomUUID(),t={id:randomUUID(),token,manager,name,budget:1000000,wins:0,draws:0,losses:0,points:0,roster:roster()};l.teams.push(t);await save();emit(l);res.json({ok:true,code,token});
  }));
  app.get('/api/foot/:code',s(async(req,res)=>{const a=auth(req,res);if(a)res.json(publicLeague(a.l,a.t.token));}));
  app.post('/api/foot/:code/auction',s(async(req,res)=>{
    const a=auth(req,res);if(!a)return;const {l,t}=a;
    if(t.id!==l.teams[0].id)return fail(res,403,'Seul le créateur de ligue peut ouvrir une enchère.');
    if(l.auction)return fail(res,400,'Une enchère est déjà ouverte.');
    const p=l.market.find(p=>p.id===req.body?.playerId&&!p.owner);if(!p)return fail(res,400,'Joueur indisponible.');
    l.auction={playerId:p.id,playerName:p.name,price:p.value,highBidder:null,endsAt:Date.now()+120000};await save();emit(l);res.json({ok:true});
  }));
  app.post('/api/foot/:code/bid',s(async(req,res)=>{
    const a=auth(req,res);if(!a)return;const {l,t}=a,x=l.auction;if(!x)return fail(res,400,'Aucune enchère ouverte.');
    if(Date.now()>=x.endsAt)return fail(res,400,'Enchère terminée : demande à l’hôte de la clôturer.');
    const amount=Number(req.body?.amount),minimum=x.highBidder?x.price+5000:x.price;
    if(!Number.isSafeInteger(amount)||amount<minimum||amount>t.budget)return fail(res,400,`Enchère minimum ${minimum.toLocaleString('fr-FR')} €, dans ton budget.`);
    x.price=amount;x.highBidder=t.id;x.endsAt=Math.max(x.endsAt,Date.now()+15000);await save();emit(l);res.json({ok:true});
  }));
  app.post('/api/foot/:code/close',s(async(req,res)=>{
    const a=auth(req,res);if(!a)return;const {l,t}=a,x=l.auction;
    if(t.id!==l.teams[0].id)return fail(res,403,'Action réservée à l’hôte.');if(!x)return fail(res,400,'Aucune enchère.');
    if(Date.now()<x.endsAt)return fail(res,400,'Le chronomètre doit être terminé.');
    const p=l.market.find(p=>p.id===x.playerId),winner=l.teams.find(z=>z.id===x.highBidder);
    if(winner&&p&&winner.budget>=x.price){winner.budget-=x.price;p.owner=winner.id;winner.roster.push({...p,starter:false});l.history.push(`${winner.name} recrute ${p.name} pour ${x.price.toLocaleString('fr-FR')} €`);}
    else l.history.push(`Enchère sans acheteur : ${x.playerName}`);
    l.auction=null;await save();emit(l);res.json({ok:true});
  }));
  app.post('/api/foot/:code/lineup',s(async(req,res)=>{
    const a=auth(req,res);if(!a)return;const {l,t}=a,ids=req.body?.ids;
    if(!Array.isArray(ids)||ids.length!==11||new Set(ids).size!==11||ids.some(id=>!t.roster.some(p=>p.id===id)))return fail(res,400,'Choisis exactement 11 joueurs de ton effectif.');
    t.roster.forEach(p=>p.starter=ids.includes(p.id));await save();emit(l);res.json({ok:true});
  }));
  // Manual fantasy points, explicitly labelled unverified. Never generate real Ligue 1 results.
  app.post('/api/foot/:code/matchday',s(async(req,res)=>{
    const a=auth(req,res);if(!a)return;const {l,t}=a;
    if(t.id!==l.teams[0].id)return fail(res,403,'Seul l’hôte peut valider une journée.');
    const results=req.body?.results,round=clean(req.body?.round,32);
    if(!round||!Array.isArray(results)||results.length!==l.teams.length||l.matchdays.some(d=>d.round===round))return fail(res,400,'Journée ou résultats invalides.');
    if(results.some(r=>!l.teams.some(t=>t.id===r.teamId)||!Number.isSafeInteger(r.points)||r.points<0||r.points>500)||new Set(results.map(r=>r.teamId)).size!==l.teams.length)return fail(res,400,'Indique entre 0 et 500 points pour chaque club, une fois.');

    for(const r of results){const team=l.teams.find(t=>t.id===r.teamId);team.points+=r.points;team.budget+=30000;}
    // Round-robin: each club meets every other club over the season (byes for odd counts).
    const fixtures=pairings(l.teams,l.matchdays.length);
    for(const [xi,yi] of fixtures){const x=l.teams.find(t=>t.id===xi),y=l.teams.find(t=>t.id===yi),a=results.find(r=>r.teamId===x.id).points,b=results.find(r=>r.teamId===y.id).points;
      if(a>b){x.wins++;y.losses++;x.budget+=70000;}else if(b>a){y.wins++;x.losses++;y.budget+=70000;}else{x.draws++;y.draws++;x.budget+=30000;y.budget+=30000;}}
    l.matchdays.push({round,results,fixtures:pairings(l.teams,l.matchdays.length),source:'manual-unverified',date:new Date().toISOString()});l.history.push(`Journée ${round} enregistrée manuellement (non vérifiée)`);await save();emit(l);res.json({ok:true});
  }));
  app.get('/api/foot/ligue1/fixtures',s(async(req,res)=>{
    if(!process.env.API_FOOTBALL_KEY)return fail(res,503,'API_FOOTBALL_KEY non configurée : rencontres officielles indisponibles.');
    const fixtures=await provider('fixtures',{league:61,season:2026,next:20});
    res.json({ok:true,fixtures:fixtures.map(x=>({id:x.fixture.id,date:x.fixture.date,home:x.teams.home.name,away:x.teams.away.name,status:x.fixture.status.short,homeGoals:x.goals.home,awayGoals:x.goals.away}))});
  }));
  app.post('/api/foot/:code/import-catalog',s(async(req,res)=>{
    const a=auth(req,res);if(!a)return;const {l,t}=a;
    if(t.id!==l.teams[0].id)return fail(res,403,'Réservé au créateur de ligue.');
    if(l.auction)return fail(res,400,'Termine l’enchère en cours avant l’import.');
    const teams=await provider('teams',{league:61,season:2026});
    if(!teams.length)return fail(res,422,'Aucun club retourné par la source.');
    const added=[];let count=0;
    for(const team of teams){
      const squad=await provider('players/squads',{team:team.team.id});
      for(const entry of squad){for(const p of entry.players||[]){
        const pos=({Goalkeeper:'G',Defender:'D',Midfielder:'M',Attacker:'A'})[p.position];if(!pos)continue;
        const key='api-'+p.id;if(l.market.some(x=>x.externalId===key || (x.name.toLowerCase()===String(p.name).toLowerCase() && x.club?.toLowerCase()===String(team.team.name).toLowerCase())))continue;
        const base=pos==='A'?110000:pos==='M'?85000:pos==='D'?70000:55000;
        // Predictable game-price tiers, not API player valuations or performance ratings.
        const tier=p.id%5;const value=[25000,50000,100000,200000,350000][tier];
        added.push({id:randomUUID(),externalId:key,name:clean(p.name,60),club:clean(team.team.name,50),position:pos,value,rating:65+tier*5,source:'api-football-2026',owner:null});
      }}count++;
    }
    l.market.push(...added);l.catalogDate=new Date().toISOString();l.history.push('Catalogue API Ligue 1 actualisé : '+added.length+' joueurs ajoutés.');await save();emit(l);res.json({ok:true,added:added.length,clubs:count});
  }));
  app.post('/api/foot/:code/sell',s(async(req,res)=>{
    const a=auth(req,res);if(!a)return;const {l,t}=a;
    const p=t.roster.find(p=>p.id===req.body?.playerId&&p.source!=='academy');
    if(!p)return fail(res,400,'Joueur acheté introuvable.');
    if(l.auction)return fail(res,400,'Termine l’enchère en cours avant la mise en vente.');
    const item=l.market.find(x=>x.id===p.id);if(!item)return fail(res,400,'Ce joueur ne peut pas être vendu.');
    // sale to bank at 65% of virtual opening value; avoids risk-free arbitrage.
    const sale=Math.round(item.value*.65/1000)*1000;t.budget+=sale;t.roster=t.roster.filter(x=>x.id!==p.id);item.owner=null;
    l.history.push(t.name+' revend '+p.name+' au marché pour '+sale+' €');await save();emit(l);res.json({ok:true,sale});
  }));
  io.on('connection',socket=>socket.on('foot:watch',({code}={})=>{const l=db.leagues[clean(code,6)];if(l)socket.join(`foot:${l.code}`)}));
}
