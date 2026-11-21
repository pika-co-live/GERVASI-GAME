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
  // Only fictional academy players are supplied; actual Ligue 1 catalog must be licensed/imported.
  const starterMarket=[
    ['Gardien espoir','G',25000,67],['Défenseur solide','D',45000,69],['Milieu créatif','M',85000,72],['Ailier rapide','A',110000,74],['Buteur confirmé','A',200000,80],['Meneur vedette','M',350000,86]
  ].map(([name,position,value,rating])=>({id:randomUUID(),name,position,value,rating,source:'fictional',owner:null}));
  const own=(league,token)=>league.teams.find(t=>t.token===token);
  function publicLeague(l,token){
    const me=own(l,token);
    return {ok:true,code:l.code,name:l.name,host:me?.id===l.teams[0].id,me:me?.id,persistence:pool?'postgres':'local-ephemeral',teams:l.teams.map(t=>({id:t.id,name:t.name,manager:t.manager,budget:t.budget,wins:t.wins,draws:t.draws,losses:t.losses,points:t.points,roster:t.id===me?.id?t.roster.map(p=>({id:p.id,name:p.name,position:p.position,rating:p.rating,starter:p.starter,source:p.source??'academy'})):undefined,playerCount:t.roster.length})),market:l.market,auction:l.auction?{...l.auction,highBidder:l.teams.find(t=>t.id===l.auction.highBidder)?.name??null}:null,history:l.history.slice(-18).reverse(),matchdays:l.matchdays.slice(-10).reverse()};
  }
  function auth(req,res){const l=db.leagues[clean(req.params.code,6)];const t=l&&own(l,req.get('x-foot-token'));if(!l||!t){fail(res,403,'Ligue ou session introuvable.');return null;}return {l,t};}
  const s=(fn)=>async(req,res)=>{try{await ready;await fn(req,res)}catch(e){console.error('[Foot Manager]',e);if(!res.headersSent)fail(res,500,'Erreur serveur.')}};
  const emit=(l)=>io.to(`foot:${l.code}`).emit('foot:changed',{code:l.code});
  app.get('/api/foot/status',s(async(req,res)=>res.json({ok:true,persistence:pool?'postgres':'local-ephemeral',automatedLigue1Stats:false})));
  app.post('/api/foot/create',s(async(req,res)=>{
    const manager=clean(req.body?.manager),name=clean(req.body?.name);if(!manager||!name)return fail(res,400,'Nom de club et pseudo obligatoires.');
    let code;do{code=String(randomInt(100000,1000000))}while(db.leagues[code]);
    const token=randomUUID(),team={id:randomUUID(),token,manager,name,budget:1000000,wins:0,draws:0,losses:0,points:0,roster:roster()};
    db.leagues[code]={code,name:'Ligue privée',teams:[team],market:structuredClone(starterMarket).map(p=>({...p,id:randomUUID()})),auction:null,history:[],matchdays:[],createdAt:Date.now()};await save();res.json({ok:true,code,token});
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
    const ranked=[...results].sort((a,b)=>b.points-a.points);
    for(const r of results){const team=l.teams.find(t=>t.id===r.teamId);team.points+=r.points;team.budget+=30000;}
    // Pair consecutive participants in joining order. Unpaired club gets participation only.
    for(let i=0;i+1<l.teams.length;i+=2){const x=l.teams[i],y=l.teams[i+1],a=results.find(r=>r.teamId===x.id).points,b=results.find(r=>r.teamId===y.id).points;if(a>b){x.wins++;y.losses++;x.budget+=70000;}else if(b>a){y.wins++;x.losses++;y.budget+=70000;}else{x.draws++;y.draws++;x.budget+=30000;y.budget+=30000;}}
    l.matchdays.push({round,results,source:'manual-unverified',date:new Date().toISOString()});l.history.push(`Journée ${round} enregistrée manuellement (non vérifiée)`);await save();emit(l);res.json({ok:true});
  }));
  io.on('connection',socket=>socket.on('foot:watch',({code}={})=>{const l=db.leagues[clean(code,6)];if(l)socket.join(`foot:${l.code}`)}));
}
