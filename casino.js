import {randomInt,randomUUID} from 'node:crypto';

// Free play only: no payments, prizes, redemption, or transfer of chips.
export function mountCasino(io){
  const nsp=io.of('/casino');
  const rooms=new Map();
  const clean=s=>String(s??'').trim().replace(/[<>\x00-\x1f]/g,'').slice(0,20);
  const card=()=>({r:randomInt(2,15),s:['♠','♥','♦','♣'][randomInt(4)]});
  const deck=()=>{const d=[];for(let s of ['♠','♥','♦','♣'])for(let r=2;r<=14;r++)d.push({r,s});for(let i=d.length-1;i>0;i--){const j=randomInt(i+1);[d[i],d[j]]=[d[j],d[i]];}return d;};
  const val=c=>Math.min(10,c.r===14?11:c.r);
  function total(hand){let n=hand.reduce((a,c)=>a+val(c),0);let aces=hand.filter(c=>c.r===14).length;while(n>21&&aces>0){n-=10;aces--;}return n;}
  const send=(cb,value)=>typeof cb==='function'&&cb(value);
  function bjState(room,p){
    const g=room.bj;
    if(!g)return {phase:'betting',seats:room.players.map(x=>({id:x.id,name:x.name,seat:x.seat,connected:!!x.sid,stake:0,hands:[]})),dealer:[],turn:null,minBet:10,maxBet:1000};
    return {phase:g.phase,round:g.round,seats:room.players.map(x=>({id:x.id,name:x.name,seat:x.seat,connected:!!x.sid,stake:g.bets[x.id]||0,ready:!!g.bets[x.id],hands:(g.hands[x.id]||[]).map(h=>({cards:h.cards,bet:h.bet,done:h.done,result:h.result,active:g.turn?.id===x.id&&g.turn?.index===(g.hands[x.id]||[]).indexOf(h)}))})),dealer:g.dealer.map((c,i)=>g.phase==='result'||i===0?c:null),dealerTotal:g.phase==='result'?total(g.dealer):null,turn:g.turn,log:g.log.slice(-8),minBet:10,maxBet:1000};
  }
  function publicState(room,p){return {code:room.code,mode:room.mode,host:room.players[0]?.id,me:p.id,players:room.players.map(x=>({id:x.id,name:x.name,balance:x.balance,seat:x.seat,connected:!!x.sid})),blackjack:bjState(room,p),poker:room.poker?{phase:room.poker.phase,pot:room.poker.pot,hand:room.poker.hands[p.id],other:room.players.filter(x=>x.id!==p.id).map(x=>({name:x.name,ready:!!room.poker.ready[x.id]})),ready:!!room.poker.ready[p.id],result:room.poker.result,discardsRemaining:room.poker.phase==='draw'&&!room.poker.ready[p.id],turn:room.poker.turn,bet:room.poker.bet,contributed:room.poker.contributed[p.id]||0,folded:room.poker.folded}:null};}
  const draw=g=>{if(g.deck.length<1)g.deck=deck();return g.deck.pop();};
  function nextTurn(room){const g=room.bj;if(!g)return;const order=room.players.filter(x=>g.hands[x.id]).sort((a,b)=>a.seat-b.seat);
    for(const player of order)for(let i=0;i<g.hands[player.id].length;i++)if(!g.hands[player.id][i].done){g.turn={id:player.id,index:i};return;}
    g.turn=null;g.phase='dealer';
    const live=order.some(x=>g.hands[x.id].some(h=>total(h.cards)<=21&&!h.natural));
    if(live)while(total(g.dealer)<17)g.dealer.push(draw(g));
    const dt=total(g.dealer),dealerNatural=g.dealer.length===2&&dt===21;
    for(const x of order)for(const h of g.hands[x.id]){
      const t=total(h.cards);let pay=0;
      if(t>21)h.result='Perdu · Dépassé 21';
      else if(h.natural&&!dealerNatural){pay=Math.floor(h.bet*2.5);h.result='BLACKJACK ! · 3:2';}
      else if(dealerNatural&&!h.natural)h.result='Perdu · Blackjack croupier';
      else if(t===dt){pay=h.bet;h.result='Égalité · Mise rendue';}
      else if(dealerNatural||dt<=21&&dt>t)h.result='Perdu';
      else{pay=h.bet*2;h.result='Gagné · 1:1';}
      x.balance+=pay;
    }
    g.phase='result';g.log.push('Le croupier révèle ses cartes. Manche terminée.');
  }
  function broadcast(room){for(let p of room.players){if(p.sid)nsp.to(p.sid).emit('casino:state',publicState(room,p));}}
  function session(s,cb){const room=rooms.get(s.data.code);const p=room?.players.find(x=>x.token===s.data.token);if(!room||!p||p.sid!==s.id){send(cb,{ok:false,error:'Reconnecte-toi au salon.'});return null;}return {room,p};}
  function rank(hand){const nums=hand.map(c=>c.r).sort((a,b)=>b-a),counts={};nums.forEach(n=>counts[n]=(counts[n]||0)+1);const flush=hand.every(c=>c.s===hand[0].s);let straight=0;const distinct=[...new Set(nums)];if(distinct.includes(14))distinct.push(1);for(let i=0;i<=distinct.length-5;i++)if(distinct[i]-distinct[i+4]===4){straight=distinct[i];break;}const groups=Object.entries(counts).map(([r,n])=>[+r,n]).sort((a,b)=>b[1]-a[1]||b[0]-a[0]);const ordered=groups.flatMap(([r,n])=>Array(n).fill(r));if(flush&&straight)return [8,straight];if(groups[0][1]===4)return [7,...ordered];if(groups[0][1]===3&&groups[1][1]===2)return [6,...ordered];if(flush)return [5,...nums];if(straight)return [4,straight];if(groups[0][1]===3)return [3,...ordered];if(groups[0][1]===2&&groups[1][1]===2)return [2,...ordered];if(groups[0][1]===2)return [1,...ordered];return [0,...nums];}
  function compare(a,b){let x=rank(a),y=rank(b);for(let i=0;i<Math.max(x.length,y.length);i++)if((x[i]||0)!==(y[i]||0))return Math.sign((x[i]||0)-(y[i]||0));return 0;}
  function finish(room,winner,reason){const g=room.poker;if(!g)return;g.phase='showdown';if(winner){winner.balance+=g.pot;g.result=`${winner.name} remporte ${g.pot} jetons (${reason}).`;}else{const half=Math.floor(g.pot/2);room.players[0].balance+=half;room.players[1].balance+=g.pot-half;g.result='Égalité : pot partagé.';}g.turn=null;broadcast(room);}
  function showdown(room){const g=room.poker;const [a,b]=room.players;let v=compare(g.hands[a.id],g.hands[b.id]);finish(room,v>0?a:v<0?b:null,'meilleure main');}
  function code(){let c;do{c=String(randomInt(100000,1000000));}while(rooms.has(c));return c;}
  nsp.on('connection',s=>{
    s.on('casino:create',({name}={},cb)=>{name=clean(name);if(!name)return send(cb,{ok:false,error:'Entre ton pseudo.'});const room={code:code(),players:[],mode:'lobby',poker:null,bj:null};rooms.set(room.code,room);add(room,name,cb);});
    function add(room,name,cb){const p={id:randomUUID(),token:randomUUID(),name,balance:10000,sid:s.id,seat:room.players.length};room.players.push(p);s.data.code=room.code;s.data.token=p.token;s.join(room.code);send(cb,{ok:true,code:room.code,token:p.token});broadcast(room);}
    s.on('casino:join',({code:c,name}={},cb)=>{const room=rooms.get(String(c??''));name=clean(name);if(!room||!name)return send(cb,{ok:false,error:'Salon ou pseudo invalide.'});if(room.players.length>=6)return send(cb,{ok:false,error:'Salon complet (6 maximum).'});if(room.mode==='poker')return send(cb,{ok:false,error:'Table de poker en cours, attends la prochaine partie.'});if(room.mode==='blackjack'&&room.bj?.phase!=='betting'&&room.bj?.phase!=='result')return send(cb,{ok:false,error:'Manche en cours, attends la suivante.'});add(room,name,cb);});
    s.on('casino:resume',({code,token}={},cb)=>{const room=rooms.get(String(code??''));const p=room?.players.find(x=>x.token===token);if(!p)return send(cb,{ok:false,error:'Session expirée.'});if(p.sid)nsp.sockets.get(p.sid)?.disconnect(true);p.sid=s.id;s.data.code=room.code;s.data.token=p.token;s.join(room.code);send(cb,{ok:true});broadcast(room);});
    s.on('casino:mode',({mode}={},cb)=>{const z=session(s,cb);if(!z)return;const {room,p}=z;if(room.players[0]!==p)return send(cb,{ok:false,error:'Réservé à l’hôte.'});if(!['blackjack','poker'].includes(mode))return send(cb,{ok:false,error:'Mode inconnu.'});if(mode==='poker'&&room.players.length!==2)return send(cb,{ok:false,error:'Le poker V1 se joue à exactement 2 joueurs.'});if(room.mode==='blackjack'&&room.bj&&['playing','dealer'].includes(room.bj.phase))return send(cb,{ok:false,error:'Termine la manche.'});room.mode=mode;room.poker=null;room.bj=null;send(cb,{ok:true});broadcast(room);});
    s.on('casino:bj:bet',({stake}={},cb)=>{const z=session(s,cb);if(!z)return;const {room,p}=z;const n=Number(stake);
      if(room.mode!=='blackjack')return send(cb,{ok:false,error:'Rejoins la table blackjack.'});
      if(!room.bj||room.bj.phase==='result')room.bj={phase:'betting',round:(room.bj?.round||0)+1,bets:{},hands:{},turn:null,dealer:[],deck:[],log:[]};
      const g=room.bj;if(g.phase!=='betting')return send(cb,{ok:false,error:'Mises fermées.'});
      if(g.bets[p.id])return send(cb,{ok:false,error:'Mise déjà validée.'});
      if(!Number.isInteger(n)||n<10||n>1000||n>p.balance)return send(cb,{ok:false,error:'Mise invalide (10 à 1 000 jetons).'});
      p.balance-=n;g.bets[p.id]=n;g.log.push(`${p.name} est assis et mise ${n} jetons.`);send(cb,{ok:true});broadcast(room);
    });
    s.on('casino:bj:deal',(_data,cb)=>{const z=session(s,cb);if(!z)return;const {room,p}=z,g=room.bj;
      if(room.players[0]!==p)return send(cb,{ok:false,error:'Seul l’hôte distribue.'});
      if(room.mode!=='blackjack'||!g||g.phase!=='betting'||!Object.keys(g.bets).length)return send(cb,{ok:false,error:'Attends les mises.'});
      if(room.players.some(x=>!g.bets[x.id]))return send(cb,{ok:false,error:'Tous les joueurs doivent miser.'});
      g.deck=deck();g.hands={};g.dealer=[];g.phase='playing';
      for(const x of room.players)g.hands[x.id]=[{cards:[draw(g)],bet:g.bets[x.id],done:false,natural:false,result:null}];
      g.dealer.push(draw(g));
      for(const x of room.players)g.hands[x.id][0].cards.push(draw(g));
      g.dealer.push(draw(g));
      for(const x of room.players){const h=g.hands[x.id][0];h.natural=total(h.cards)===21;if(h.natural)h.done=true;}
      if(total(g.dealer)===21){for(const x of room.players)for(const h of g.hands[x.id])h.done=true;}
      g.log.push('Le croupier distribue les cartes.');nextTurn(room);send(cb,{ok:true});broadcast(room);
    });
    s.on('casino:bj:action',({action}={},cb)=>{const z=session(s,cb);if(!z)return;const {room,p}=z,g=room.bj;
      if(room.mode!=='blackjack'||!g||g.phase!=='playing'||g.turn?.id!==p.id)return send(cb,{ok:false,error:'Ce n’est pas ton tour.'});
      const index=g.turn.index,h=g.hands[p.id][index];if(!h||h.done)return send(cb,{ok:false,error:'Main déjà terminée.'});
      if(action==='hit'){h.cards.push(draw(g));if(total(h.cards)>=21)h.done=true;}
      else if(action==='stand'){h.done=true;}
      else if(action==='double'){
        if(h.cards.length!==2||p.balance<h.bet||h.fromSplitAces)return send(cb,{ok:false,error:'Doublement impossible.'});
        p.balance-=h.bet;h.bet*=2;h.cards.push(draw(g));h.done=true;
      }else if(action==='split'){
        if(g.hands[p.id].length!==1||h.cards.length!==2||val(h.cards[0])!==val(h.cards[1])||p.balance<h.bet)return send(cb,{ok:false,error:'Séparation impossible.'});
        p.balance-=h.bet;
        const c=h.cards.pop(),aces=h.cards[0].r===14;
        h.cards.push(draw(g));h.natural=false;h.fromSplitAces=aces;
        const other={cards:[c,draw(g)],bet:h.bet,done:false,natural:false,fromSplitAces:aces,result:null};
        g.hands[p.id].push(other);
        if(aces){h.done=true;other.done=true;}
      }else return send(cb,{ok:false,error:'Action inconnue.'});
      g.log.push(`${p.name} : ${action==='hit'?'tire':action==='stand'?'reste':action==='double'?'double':'sépare'}.`);
      nextTurn(room);send(cb,{ok:true});broadcast(room);
    });
    s.on('casino:poker:start',(_data,cb)=>{const z=session(s,cb);if(!z)return;const {room,p}=z;if(room.players[0]!==p||room.mode!=='poker'||room.players.length!==2)return send(cb,{ok:false,error:'Deux joueurs requis et seul l’hôte lance.'});if(room.poker&&room.poker.phase!=='showdown')return send(cb,{ok:false,error:'Main déjà en cours.'});if(room.players.some(x=>x.balance<100))return send(cb,{ok:false,error:'Il faut 100 jetons par joueur.'});const d=deck(),hands={};for(let x of room.players){x.balance-=100;hands[x.id]=Array.from({length:5},()=>d.pop());}room.poker={phase:'draw',pot:200,deck:d,hands,ready:{},bet:0,contributed:{},turn:null,result:null,folded:null};send(cb,{ok:true});broadcast(room);});
    s.on('casino:poker:draw',({indices}={},cb)=>{const z=session(s,cb);if(!z)return;const {room,p}=z,g=room.poker;if(room.mode!=='poker'||!g||g.phase!=='draw'||g.ready[p.id])return send(cb,{ok:false,error:'Échange indisponible.'});if(!Array.isArray(indices)||indices.length>3||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>4))return send(cb,{ok:false,error:'Sélectionne jusqu’à 3 cartes.'});for(const i of indices)g.hands[p.id][i]=g.deck.pop();g.ready[p.id]=true;if(room.players.every(x=>g.ready[x.id])){g.phase='bet';g.turn=room.players[0].id;}send(cb,{ok:true});broadcast(room);});
    s.on('casino:poker:act',({action}={},cb)=>{const z=session(s,cb);if(!z)return;const {room,p}=z,g=room.poker;if(room.mode!=='poker'||!g||g.phase!=='bet'||g.turn!==p.id)return send(cb,{ok:false,error:'Ce n’est pas ton tour.'});const other=room.players.find(x=>x!==p),paid=g.contributed[p.id]||0,required=g.bet-paid;if(action==='fold'){g.folded=p.id;send(cb,{ok:true});return finish(room,other,'abandon');}if(action==='raise'){if(g.bet!==0||p.balance<100||other.balance<100)return send(cb,{ok:false,error:'Relance impossible.'});p.balance-=100;g.pot+=100;g.bet=100;g.contributed[p.id]=100;g.turn=other.id;}else if(action==='call'){if(required>p.balance)return send(cb,{ok:false,error:'Solde insuffisant.'});p.balance-=required;g.pot+=required;g.contributed[p.id]=(g.contributed[p.id]||0)+required;if(g.bet>0||g.contributed[other.id]!==undefined){send(cb,{ok:true});return showdown(room);}g.contributed[p.id]=0;g.turn=other.id;}else return send(cb,{ok:false,error:'Action invalide.'});send(cb,{ok:true});broadcast(room);});
    s.on('disconnect',()=>{const room=rooms.get(s.data.code),p=room?.players.find(x=>x.token===s.data.token);if(p&&p.sid===s.id){p.sid=null;broadcast(room);}});
  });
  setInterval(()=>{for(let [code,r] of rooms)if(r.players.every(p=>!p.sid))rooms.delete(code);},60*60*1000).unref();
}
