import test from 'node:test';
import assert from 'node:assert/strict';
import {designLayerBlocks,layerInsertionIndex,reorderDesignBlock} from '../src/shared/designLayerOrder.js';
const layer=(id,props={})=>({id,...props}),ids=layers=>layers.map(l=>l.id);

test('layer insertion uses visual top-first order and supports both ends and exact no-ops',()=>{
 const layers=['a','b','c','d'].map(id=>layer(id));
 assert.deepEqual(designLayerBlocks(layers).map(b=>b.id),['layer:d','layer:c','layer:b','layer:a']);
 assert.deepEqual(ids(reorderDesignBlock(layers,'layer:a',0)),['b','c','d','a']);
 assert.deepEqual(ids(reorderDesignBlock(layers,'layer:d',3)),['d','a','b','c']);
 assert.deepEqual(ids(reorderDesignBlock(layers,'layer:b',1)),['a','c','b','d']);
 assert.equal(reorderDesignBlock(layers,'layer:b',2),layers);
 assert.equal(reorderDesignBlock(layers,'missing',0),layers);
 assert.equal(reorderDesignBlock(layers,'layer:a',NaN),layers);
 assert.deepEqual(ids(layers),['a','b','c','d']);
});
test('groups remain atomic and preserve member order, including when targeted from below or above',()=>{
 const layers=[layer('a'),layer('b',{group:'g'}),layer('c',{group:'g'}),layer('d')];
 const blocks=designLayerBlocks(layers);assert.deepEqual(blocks.map(b=>ids(b.layers)),[['d'],['c','b'],['a']]);
 assert.deepEqual(ids(reorderDesignBlock(layers,'group:g',0)),['a','d','b','c']);
 assert.deepEqual(ids(reorderDesignBlock(layers,'group:g',2)),['b','c','a','d']);
 assert.deepEqual(ids(reorderDesignBlock(layers,'layer:a',1)),['b','c','a','d']);
 assert.deepEqual(ids(reorderDesignBlock(layers,'layer:d',1)),['a','d','b','c']);
 assert.equal(reorderDesignBlock(layers,'group:g',1),layers);
});
test('a locked source or group is never moved; hidden layers and locks remain intact',()=>{
 const layers=[layer('a',{hidden:true}),layer('b',{group:'g',locked:true}),layer('c',{group:'g'}),layer('d',{locked:true})];
 assert.equal(reorderDesignBlock(layers,'group:g',0),layers);assert.equal(reorderDesignBlock(layers,'layer:d',3),layers);
 const next=reorderDesignBlock(layers,'layer:a',0);assert.equal(next.at(-1),layers[0]);assert.equal(next[0],layers[1]);assert.equal(next[0].locked,true);
});
test('hover slots use measured heights, skip the dragged block and remain stable at a fixed pointer position',()=>{
 const blocks=designLayerBlocks(['a','b','c','d'].map(id=>layer(id))),heights=new Map([['layer:d',32],['layer:c',96],['layer:b',32],['layer:a',32]]);
 for(const [offset,index]of[[-10,0],[16,0],[17,1],[80,1],[81,2],[144,2],[145,3],[1000,3]]){
  assert.equal(layerInsertionIndex(blocks,'layer:a',heights,offset),index);
  assert.equal(layerInsertionIndex(blocks,'layer:a',heights,offset),index);
 }
 assert.equal(layerInsertionIndex(blocks,'layer:c',heights,48),1);
 assert.equal(layerInsertionIndex(blocks,'layer:c',heights,49),2);
});
