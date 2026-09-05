import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTION_ICON_NAMES, createActionIcon } from './action-icons.js';
const documentRef={createElementNS(_namespace,tag){return {tag,attributes:{},children:[],setAttribute(name,value){this.attributes[name]=value;},append(child){this.children.push(child);}};}};

test('header and existing action icons share the same SVG geometry contract',()=>{
  assert.equal(new Set(ACTION_ICON_NAMES).size,ACTION_ICON_NAMES.length);
  for(const name of ACTION_ICON_NAMES){const icon=createActionIcon(documentRef,name);assert.equal(icon.attributes.viewBox,'0 0 24 24');assert.equal(icon.attributes.stroke,'currentColor');assert.equal(icon.attributes['aria-hidden'],'true');assert.ok(icon.children.length>0);}
  for(const name of ['search','book','moon','sun']) assert.ok(ACTION_ICON_NAMES.includes(name));
});
test('home shell keeps SVG icons when changing theme without loading the data runtime',async()=>{
  const code=await readFile(new URL('../galpedia-boot.js',import.meta.url),'utf8');
  assert.doesNotMatch(code,/themeButton\.textContent\s*=/);
  assert.match(code,/themeButton\.replaceChildren\(createActionIcon\(document, light \? 'moon' : 'sun'\)\)/);
  assert.match(code,/global-search-open'\)\.replaceChildren\(createActionIcon\(document, 'search'\)\)/);
});
