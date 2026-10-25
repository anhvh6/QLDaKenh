import test from 'node:test';import assert from 'node:assert/strict';
import {composerEnterAction} from '../public/composer-keyboard.js';
test('phone/Fold Enter never sends, including repeat and modifier keys',()=>{for(const extra of [{},{repeat:true},{altKey:true},{shiftKey:true}])assert.equal(composerEnterAction({key:'Enter',...extra},true),'native');});
test('desktop plain Enter sends; Alt+Enter inserts a line; repeated Enter cannot resend',()=>{assert.equal(composerEnterAction({key:'Enter'},false),'send');assert.equal(composerEnterAction({key:'Enter',altKey:true},false),'newline');assert.equal(composerEnterAction({key:'Enter',repeat:true},false),'block');});
test('IME confirmation and consumed suggestion keys never send',()=>{for(const extra of [{isComposing:true},{keyCode:229},{defaultPrevented:true}])assert.equal(composerEnterAction({key:'Enter',...extra},false),'ignore');});
