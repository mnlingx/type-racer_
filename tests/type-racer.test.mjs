import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

function canvasContext(){
  const noop=()=>{};
  return {
    scale:noop,fillRect:noop,fillText:noop,save:noop,restore:noop,translate:noop,
    rotate:noop,beginPath:noop,arc:noop,moveTo:noop,lineTo:noop,stroke:noop,
    rect:noop,clip:noop,strokeRect:noop,fill:noop
  };
}

function apiEntries(length,count=30){
  const alphabet='abcdefghijklmnopqrstuvwxyz';
  return Array.from({length:count},(_,index)=>({
    word:Array.from({length},(_,position)=>alphabet[(index+position)%alphabet.length]).join(''),
    tags:[`f:${index+1}`]
  }));
}

function gameHarness(fetchImpl=async()=>{throw Error('offline')}){
  const listeners={};
  const context2d=canvasContext();
  const canvas={
    getContext:()=>context2d,
    addEventListener:(type,handler)=>listeners[type]=handler,
    getBoundingClientRect:()=>({left:0,top:0,width:280,height:540})
  };
  const sandbox={
    document:{getElementById:()=>canvas},
    addEventListener:(type,handler)=>listeners[type]=handler,
    requestAnimationFrame:()=>{},fetch:fetchImpl,AbortSignal,Math,console
  };
  const exposed=`
    globalThis.game={state,wordsByLength,wordsReady,fetchWords,startGame,replaceWords,
      handleTypedLetter,handleKeyDown,handleCanvasClick,spawnCoinTrail,update,render};`;
  vm.createContext(sandbox);
  vm.runInContext(script+exposed,sandbox);
  return {game:sandbox.game,listeners};
}

async function playingGame(difficulty=0,fetchImpl){
  const harness=gameHarness(fetchImpl);
  await harness.game.wordsReady;
  await harness.game.startGame(difficulty);
  return harness;
}

test('deployment remains a self-contained 2x canvas document',()=>{
  assert.ok(script,'inline game script is present');
  assert.match(html,/<canvas[^>]+width="560"[^>]+height="1080"/);
  assert.doesNotMatch(html,/<script[^>]+src=/);
  assert.doesNotMatch(html,/<img\b/);
  assert.match(html,/aspect-ratio:280\/540/);
  assert.doesNotThrow(()=>new Function(script));
});

test('offline fallback contains at least 25 valid words per required length',async()=>{
  const {game}=gameHarness();
  await game.wordsReady;
  for(const length of [3,4,5,6]){
    assert.ok(game.wordsByLength[length].length>=25);
    assert.ok(game.wordsByLength[length].every(word=>word.length===length&&/^[a-z]+$/.test(word)));
    assert.equal(new Set(game.wordsByLength[length]).size,game.wordsByLength[length].length);
  }
});

test('successful API responses replace fallbacks with filtered frequency-ranked words',async()=>{
  const fetchMock=async url=>{
    const length=decodeURIComponent(new URL(url).searchParams.get('sp')).length;
    const entries=apiEntries(length);
    entries.push({word:'not-valid',tags:['f:999']},{word:'x',tags:['f:999']},entries[0]);
    return {ok:true,json:async()=>entries};
  };
  const {game}=gameHarness(fetchMock);
  await game.wordsReady;
  for(const length of [3,4,5,6]){
    assert.equal(game.wordsByLength[length].length,26);
    assert.equal(game.wordsByLength[length][0],apiEntries(length).at(-1).word);
    assert.ok(game.wordsByLength[length].every(word=>word.length===length&&/^[a-z]+$/.test(word)));
  }
});

test('HTTP errors preserve the offline fallback and do not block starting',async()=>{
  const {game}=gameHarness(async()=>({ok:false,status:503}));
  await game.startGame(0);
  assert.equal(game.state.phase,'play');
  assert.equal(game.state.leftWord.length,3);
  assert.equal(game.state.rightWord.length,3);
});

test('difficulty modes select only their allowed word lengths',async()=>{
  for(const [difficulty,allowed] of [[0,[3]],[1,[4,5]],[2,[5,6]]]){
    const {game}=await playingGame(difficulty);
    assert.ok(allowed.includes(game.state.leftWord.length));
    assert.ok(allowed.includes(game.state.rightWord.length));
  }
});

test('word pairs have distinct initials and retain only the last 12 words',async()=>{
  const {game}=await playingGame();
  for(let index=0;index<20;index++){
    game.replaceWords();
    assert.notEqual(game.state.leftWord[0],game.state.rightWord[0]);
  }
  assert.equal(game.state.recentWords.length,12);
});

test('typing a complete word moves one lane and replaces both words',async()=>{
  const {game}=await playingGame();
  const previousLeft=game.state.leftWord;
  const previousRight=game.state.rightWord;
  for(const letter of previousLeft)game.handleTypedLetter(letter);
  assert.equal(game.state.lane,0);
  assert.equal(game.state.phase,'play');
  assert.notEqual(`${game.state.leftWord}:${game.state.rightWord}`,`${previousLeft}:${previousRight}`);
});

test('a wrong letter resets typing progress and flashes the error state',async()=>{
  const {game}=await playingGame();
  game.handleTypedLetter(game.state.leftWord[0]);
  assert.equal(game.state.activeWord,0);
  game.handleTypedLetter(game.state.leftWord[1]==='z'?'y':'z');
  assert.equal(game.state.activeWord,null);
  assert.equal(game.state.typedLength,0);
  assert.equal(game.state.errorFlash,.2);
});

test('typing outward at a road edge crashes and records the best score',async()=>{
  const {game}=await playingGame();
  for(const letter of game.state.leftWord)game.handleTypedLetter(letter);
  game.state.score=30;
  for(const letter of game.state.leftWord)game.handleTypedLetter(letter);
  assert.equal(game.state.phase,'over');
  assert.equal(game.state.crashDirection,-1);
  assert.equal(game.state.bestScore,30);
  game.update(.71);
  assert.ok(game.state.crashTime>.7);
});

test('coins score once when they reach the car in its lane',async()=>{
  const {game}=await playingGame();
  game.state.coins=[{lane:1,y:398}];
  game.update(0);
  assert.equal(game.state.score,10);
  assert.equal(game.state.coins.length,0);
  game.update(0);
  assert.equal(game.state.score,10);
});

test('coin trails contain three to five coins in one lane',async()=>{
  const {game}=await playingGame();
  game.state.coins=[];
  game.spawnCoinTrail();
  assert.ok(game.state.coins.length>=3&&game.state.coins.length<=5);
  assert.equal(new Set(game.state.coins.map(coin=>coin.lane)).size,1);
});

test('speed increases to x1.5 after 90 seconds and shows its notice',async()=>{
  const {game}=await playingGame();
  game.state.runTime=89.99;
  game.update(.02);
  assert.equal(game.state.lastSpeed,1.5);
  assert.ok(game.state.speedNotice>1.4);
});

test('keyboard selection, replay, and canvas difficulty selection are gated by phase',async()=>{
  const first=gameHarness();
  first.game.handleKeyDown({key:'1',ctrlKey:false,metaKey:false,altKey:false});
  await first.game.wordsReady;
  await Promise.resolve();
  assert.equal(first.game.state.difficulty,0);
  assert.equal(first.game.state.phase,'play');

  const second=gameHarness();
  second.game.handleCanvasClick({clientX:140,clientY:215});
  await second.game.wordsReady;
  await Promise.resolve();
  assert.equal(second.game.state.difficulty,0);
  assert.equal(second.game.state.phase,'play');
});

test('update and render execute in start, play, and crash phases',async()=>{
  const {game}=gameHarness();
  game.update(.016);
  assert.doesNotThrow(()=>game.render());
  await game.startGame(1);
  game.update(.016);
  assert.doesNotThrow(()=>game.render());
  game.state.phase='over';
  game.state.crashTime=.2;
  game.update(.016);
  assert.doesNotThrow(()=>game.render());
});

test('modern-browser APIs have safe production fallbacks',()=>{
  assert.match(script,/AbortSignal\.timeout\(4000\)/);
  assert.match(script,/catch\s*\{[\s\S]*Built-in words keep the game playable offline/);
  assert.match(script,/entry\.tags\?\./);
  assert.match(html,/image-rendering:pixelated/);
  assert.match(html,/tabindex="0"/);
  assert.match(html,/aria-label=/);
});
