import test from 'node:test';import assert from 'node:assert/strict';import {measureHumanAttention} from './human-attention.mjs';
const session = () => ({session_id:'s1',operator_id:'h1',source:'timed_human',consent_record_id:'consent1',status:'completed',intervals:[{start_ms:0,end_ms:120000,category:'briefing',phase:'startup'},{start_ms:60000,end_ms:180000,category:'repair',phase:'steady_state'}]});
test('human attention unions simultaneous windows instead of multiplying agents',()=>assert.equal(measureHumanAttention({sessions:[session()],expectedSessions:['s1']}).active_minutes,3));
test('human attrition stays in denominator',()=>{const s=session();s.status='abandoned';assert.equal(measureHumanAttention({sessions:[s],expectedSessions:['s1']}).abandoned,1);});
test('simulated human time rejected',()=>{const s=session();s.source='simulated';assert.throws(()=>measureHumanAttention({sessions:[s],expectedSessions:['s1']}));});
test('missing/duplicate sessions rejected',()=>{assert.throws(()=>measureHumanAttention({sessions:[session()],expectedSessions:['s1','s2']}));assert.throws(()=>measureHumanAttention({sessions:[session(),session()],expectedSessions:['s1']}));});
test('negative/reversed measured intervals rejected',()=>{const s=session();s.intervals[0].end_ms=-1;assert.throws(()=>measureHumanAttention({sessions:[s],expectedSessions:['s1']}));});
