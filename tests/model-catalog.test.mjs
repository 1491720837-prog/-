import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeModels, toolSupport, requireToolSupport} from '../scripts/model-catalog.mjs';

const catalog = [
  {id:'anthropic/claude-sonnet-5.5',name:'Claude Sonnet 5.5',context_length:1000000,supported_parameters:['tools','temperature'],architecture:{input_modalities:['text','image','file']},pricing:{prompt:'0.000002',completion:'0.00001'}},
  {id:'x-ai/grok-4.20-multi-agent',supported_parameters:['temperature'],architecture:{input_modalities:['text']}},
  {name:'没有 id 的条目'},
  null,
];

test('the catalog keeps tool and vision capability but drops malformed entries',()=>{
  const models=normalizeModels({data:catalog});
  assert.deepEqual(models.map(m=>m.id),['anthropic/claude-sonnet-5.5','x-ai/grok-4.20-multi-agent']);
  assert.equal(models[0].tools,true);assert.equal(models[0].vision,true);
  assert.equal(models[0].context,1000000);assert.equal(models[0].prompt,0.000002);
  assert.equal(models[1].name,'x-ai/grok-4.20-multi-agent');assert.equal(models[1].tools,false);
  assert.deepEqual(normalizeModels({}),[]);assert.deepEqual(normalizeModels(null),[]);
});

test('an unknown model is never blocked, a known model without tools is',()=>{
  const models=normalizeModels({data:catalog});
  assert.equal(toolSupport(models,'never-listed'),null);
  assert.equal(requireToolSupport(models,'never-listed'),null);
  assert.equal(requireToolSupport(models,'anthropic/claude-sonnet-5.5'),true);
  assert.throws(()=>requireToolSupport(models,'x-ai/grok-4.20-multi-agent'),/工具调用/);
});
