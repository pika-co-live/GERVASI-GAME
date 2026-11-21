import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import { randomInt, randomUUID } from 'node:crypto';
import { mountFootManager } from './foot-manager.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({limit:'24kb'}));
app.use(express.static('public'));
app.get('/health', (_req,res) => res.json({ok:true}));
const httpServer = http.createServer(app);
const io = new Server(httpServer, { maxHttpBufferSize: 10000, cors: { origin: false } });
mountFootManager(app,io);
const rooms = new Map();
const MAX_PLAYERS=5, MIN_PLAYERS=2;
const WORDS=[['Plage','Piscine'],['Avion','Hélicoptère'],['Pizza','Burger'],['Cinéma','Théâtre'],['Chat','Chien'],['Café','Thé'],['Montagne','Forêt'],['Pomme','Poire'],['Train','Métro'],['Guitare','Piano'],['Soleil','Lune'],['Basket','Football'],['Bateau','Sous-marin'],['Glace','Gâteau'],['Hôtel','Camping'],['Tennis','Padel'],['Livre','Journal'],['Voiture','Moto'],['Paris','Londres'],['Chocolat','Caramel']];
const LOCATIONS=['Aéroport','Restaurant','Cinéma','École','Hôpital','Plage','Stade','Musée','Supermarché','Hôtel','Bibliothèque','Camping','Salle de sport','Gare','Parc aquatique','Boulangerie','Zoo','Bateau de croisière','Boîte de nuit','Salon de coiffure'];
const MISSIONS=[
  {title:'Sécuriser le coffre',description:'L’équipe doit approuver la fermeture du coffre.',choices:['VERROUILLER','VÉRIFIER']},
  {title:'Réparer le réseau',description:'L’équipe tente de rétablir la connexion.',choices:['RÉPARER','TESTER']},
  {title:'Protéger les données',description:'L’équipe protège les informations secrètes.',choices:['CHIFFRER','SAUVEGARDER']},
  {title:'Rétablir le courant',description:'L’équipe remet les générateurs en marche.',choices:['REDÉMARRER','INSPECTER']},
  {title:'Ouvrir le passage',description:'L’équipe organise une sortie sécurisée.',choices:['DÉBLOQUER','SÉCURISER']},
  {title:'Sauver la mission',description:'Dernière action avant la fin de la mission.',choices:['VALIDER','CONTRÔLER']}
];
function reply(cb, data) { if (typeof cb === 'function') cb(data); }
function err(cb, message) { reply(cb, {ok:false,error:message}); }
function pick(arr) { return arr[randomInt(arr.length)]; }
function code() { let s; do {s=String(randomInt(100000,1000000));} while (rooms.has(s)); return s; }
function cleanName(input) { return typeof input==='string' ? input.trim().replace(/[<>\u0000-\u001f]/g,'').slice(0,18) : ''; }
function cleanCode(input) { return typeof input==='string' ? input.replace(/\D/g,'').slice(0,6) : ''; }
function getParticipant(room,token) { return room.players.find(p=>p.token===token); }
function host(room) { return room.players[0]; }
function allActive(room) {return room.players.every(p=>p.connected);}
function participants(room) {return room.players.map(p=>({id:p.id,name:p.name,connected:p.connected,score:p.score,isHost:p.id===host(room)?.id}));}
function broadcast(room) { for (const p of room.players) {if(p.socketId) io.to(p.socketId).emit('state', stateFor(room,p));} }
function stateFor(room,player) {
  const g=room.game;
  const base={code:room.code,me:player.id,host:host(room)?.id,players:participants(room),phase:g?.phase??'lobby',gameType:g?.type??null,round:room.round,canStart:allActive(room) && room.players.length>=MIN_PLAYERS};
  if(!g) return base;
  const roles=g.roles;
  base.mine={role:roles[player.id],word:g.type==='impostor' ? (roles[player.id]==='impostor'?g.otherWord:g.word) : undefined,location:g.type==='spy' && roles[player.id]!=='spy'?g.location:undefined};
  if(g.type==='impostor') base.explanation='Donnez chacun un indice oral, puis votez pour l’imposteur.';
  if(g.type==='spy') base.explanation='Posez des questions à l’oral. L’espion doit deviner le lieu sans se faire démasquer.';
  if(g.type==='saboteur') {base.mission=g.phase==='mission' ? {...g.missions[g.missionIndex],number:g.missionIndex+1,total:3} : null; base.missionHistory=g.missionHistory; base.submitted=!!g.submissions[player.id];}
  base.voted=!!g.votes[player.id];
  base.voteCount=Object.keys(g.votes).length;
  base.submitCount=Object.keys(g.submissions??{}).length;
  if(g.phase==='result') base.result=g.result;
  return base;
}
function validSession(socket,cb) {
  const code=socket.data.code, token=socket.data.token;
  const room=rooms.get(code), player=room&&getParticipant(room,token);
  if(!room||!player||player.socketId!==socket.id) {err(cb,'Session introuvable : rejoins un salon.');return null;}
  return {room,player};
}
function assignRoles(room,type) {
  const ids=room.players.map(p=>p.id), special=pick(ids),roles={};
  for(const id of ids) roles[id]=(id===special ? ({impostor:'impostor',spy:'spy',saboteur:'saboteur'}[type]) : 'innocent');
  return roles;
}
function startGame(room,type) {
  const g={type,phase:type==='saboteur'?'mission':'discussion',roles:assignRoles(room,type),votes:{},submissions:{},result:null,missionHistory:[],missionIndex:0};
  if(type==='impostor') {const [a,b]=pick(WORDS); if(randomInt(2)) {g.word=a;g.otherWord=b;} else {g.word=b;g.otherWord=a;}}
  if(type==='spy') g.location=pick(LOCATIONS);
  if(type==='saboteur') g.missions=Array.from({length:3},()=>pick(MISSIONS));
  room.game=g; room.round++;
}
function outcome(room) {
  const g=room.game;
  const counts={}; for(const target of Object.values(g.votes)) counts[target]=(counts[target]??0)+1;
  const max=Math.max(...Object.values(counts));
  const tied=Object.keys(counts).filter(k=>counts[k]===max);
  const chosen=tied.length===1?tied[0]:null;
  const bad=Object.keys(g.roles).find(id=>g.roles[id]!=='innocent');
  const found=chosen===bad;
  let teamWins=found;
  if(g.type==='saboteur') {const sabotageCount=g.missionHistory.filter(m=>m.sabotaged).length;teamWins=found || sabotageCount<2;}
  for(const p of room.players) {if(teamWins && g.roles[p.id]==='innocent')p.score+=1; if(!teamWins && g.roles[p.id]!=='innocent')p.score+=2;}
  g.phase='result';
  g.result={target:chosen, tie:!chosen, bad, badName:room.players.find(p=>p.id===bad)?.name, targetName:room.players.find(p=>p.id===chosen)?.name ?? null, teamWins,roles:Object.fromEntries(room.players.map(p=>[p.id,g.roles[p.id]])), word:g.type==='impostor'?g.word:undefined,otherWord:g.type==='impostor'?g.otherWord:undefined, location:g.type==='spy'?g.location:undefined,history:g.missionHistory};
}
function detachSocket(socket) {
  const room=rooms.get(socket.data.code); if(!room)return;
  const p=getParticipant(room,socket.data.token);if(!p||p.socketId!==socket.id)return;
  p.connected=false;p.socketId=null;p.lastSeen=Date.now();broadcast(room);
}
function attach(socket,room,player) {
  if(player.socketId&&player.socketId!==socket.id) io.sockets.sockets.get(player.socketId)?.disconnect(true);
  socket.data.code=room.code;socket.data.token=player.token;
  player.socketId=socket.id;player.connected=true;player.lastSeen=Date.now();socket.join(room.code);
  broadcast(room);
}
io.on('connection',socket=>{
  socket.on('create',({name}={},cb)=>{
    if(socket.data.code)return err(cb,'Tu es déjà dans un salon.');
    name=cleanName(name);if(!name)return err(cb,'Entre un pseudo.');
    const room={code:code(),players:[],game:null,round:0,created:Date.now()};rooms.set(room.code,room);
    const player={id:randomUUID(),token:randomUUID(),name,score:0,socketId:null,connected:false,lastSeen:Date.now()};room.players.push(player);
    attach(socket,room,player);reply(cb,{ok:true,code:room.code,token:player.token});
  });
  socket.on('join',({code:incoming,name,token}={},cb)=>{
    if(socket.data.code)return err(cb,'Tu es déjà dans un salon.');
    const room=rooms.get(cleanCode(incoming));if(!room)return err(cb,'Code de salon introuvable.');
    if(typeof token==='string') {
      const existing=getParticipant(room,token);
      if(existing){attach(socket,room,existing);return reply(cb,{ok:true,code:room.code,token:existing.token});}
    }
    if(room.game)return err(cb,'Une partie est en cours : attends le retour au salon.');
    if(room.players.length>=MAX_PLAYERS)return err(cb,'Le salon est complet (5 joueurs).');
    name=cleanName(name);if(!name)return err(cb,'Entre un pseudo.');
    if(room.players.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))return err(cb,'Ce pseudo est déjà utilisé.');
    const player={id:randomUUID(),token:randomUUID(),name,score:0,socketId:null,connected:false,lastSeen:Date.now()};room.players.push(player);attach(socket,room,player);
    reply(cb,{ok:true,code:room.code,token:player.token});
  });
  socket.on('start',({type}={},cb)=>{
    const s=validSession(socket,cb);if(!s)return;const {room,player}=s;
    if(player.id!==host(room)?.id)return err(cb,'Seul l’hôte peut lancer le jeu.');
    if(!['impostor','spy','saboteur'].includes(type))return err(cb,'Jeu inconnu.');
    if(room.game)return err(cb,'Une manche est déjà en cours.');
    if(room.players.length<MIN_PLAYERS||!allActive(room))return err(cb,'Il faut 2 à 5 joueurs connectés.');
    startGame(room,type);broadcast(room);reply(cb,{ok:true});
  });
  socket.on('vote',({target}={},cb)=>{
    const s=validSession(socket,cb);if(!s)return;const {room,player}=s,g=room.game;
    if(!g||g.phase!=='vote')return err(cb,'Le vote n’est pas ouvert.');
    if(g.votes[player.id])return err(cb,'Tu as déjà voté.');
    if(target===player.id||!room.players.some(p=>p.id===target))return err(cb,'Choisis un autre joueur.');
    g.votes[player.id]=target;
    if(Object.keys(g.votes).length===room.players.length)outcome(room);
    broadcast(room);reply(cb,{ok:true});
  });
  socket.on('advance',(_data,cb)=>{
    const s=validSession(socket,cb);if(!s)return;const {room,player}=s,g=room.game;
    if(player.id!==host(room)?.id)return err(cb,'Action réservée à l’hôte.');
    if(!g)return err(cb,'Pas de partie en cours.');
    if(!allActive(room))return err(cb,'Attends la reconnexion de tous les joueurs.');
    if(g.phase==='discussion')g.phase='vote';
    else if(g.phase==='mission'){
      if(Object.keys(g.submissions).length!==room.players.length)return err(cb,'Tous les joueurs doivent valider leur action.');
      const sabotaged=Object.entries(g.submissions).some(([id,value])=>g.roles[id]==='saboteur'&&value==='sabotage');
      g.missionHistory.push({title:g.missions[g.missionIndex].title,sabotaged});
      g.missionIndex++;g.submissions={};
      g.phase=g.missionIndex===3?'discussion':'mission';
    }
    else return err(cb,'Impossible de passer à l’étape suivante.');
    broadcast(room);reply(cb,{ok:true});
  });
  socket.on('mission',({action}={},cb)=>{
    const s=validSession(socket,cb);if(!s)return;const {room,player}=s,g=room.game;
    if(!g||g.type!=='saboteur'||g.phase!=='mission')return err(cb,'Pas de mission active.');
    if(g.submissions[player.id])return err(cb,'Action déjà envoyée.');
    if(!['help','sabotage'].includes(action))return err(cb,'Action invalide.');
    if(action==='sabotage'&&g.roles[player.id]!=='saboteur')return err(cb,'Action non autorisée.');
    g.submissions[player.id]=action;broadcast(room);reply(cb,{ok:true});
  });
  socket.on('lobby',(_data,cb)=>{
    const s=validSession(socket,cb);if(!s)return;const {room,player}=s;
    if(player.id!==host(room)?.id)return err(cb,'Action réservée à l’hôte.');
    if(!room.game||room.game.phase!=='result')return err(cb,'Termine d’abord la manche.');
    room.game=null;broadcast(room);reply(cb,{ok:true});
  });
  socket.on('leave',(_data,cb)=>{
    const s=validSession(socket,cb);if(!s)return;const {room,player}=s;
    if(room.game)return err(cb,'Attends la fin de la partie pour quitter le salon.');
    room.players=room.players.filter(p=>p.id!==player.id);
    socket.leave(room.code);socket.data.code=null;socket.data.token=null;
    if(!room.players.length)rooms.delete(room.code);else broadcast(room);
    reply(cb,{ok:true});
  });
  socket.on('disconnect',()=>detachSocket(socket));
});
// Cleanup inactive rooms to avoid retaining stale sessions indefinitely.
setInterval(()=>{
  const now=Date.now();
  for(const [key,room] of rooms){if(room.players.every(p=>!p.connected)&&room.players.every(p=>now-p.lastSeen>60*60*1000))rooms.delete(key);}
},10*60*1000).unref();
const port=Number(process.env.PORT)||3000;
httpServer.listen(port,'0.0.0.0',()=>console.log(`Secret Party ready on ${port}`));
