import{s as e}from"./useButton-DBS-yyEp.js";async function t(){try{let e=await fetch(`/api/app/plugins`);return e.ok?await e.json():null}catch{return null}}async function n(){return e(`/api/app/admin/plugins`)}async function r(t){return e(`/api/app/admin/plugins`,{method:`PUT`,body:JSON.stringify(t)})}async function i(){return e(`/api/app/admin/plugins/store`)}async function a(t,n){return e(`/api/app/admin/plugins/install`,{method:`POST`,body:JSON.stringify({id:t,sourceId:n})})}async function o(t){return e(`/api/app/admin/plugins/${encodeURIComponent(t)}`,{method:`DELETE`})}async function s(e){let t=await e.arrayBuffer(),n=await fetch(`/api/app/admin/plugins/upload`,{method:`POST`,headers:{"content-type":`application/zip`},body:t});if(!n.ok){let e=`Failed to install the package.`;try{e=(await n.json()).error?.message??e}catch{}throw Error(e)}return await n.json()}new TextDecoder;var c=new Set([`path`,`circle`,`ellipse`,`rect`,`line`,`polyline`,`polygon`,`g`,`defs`,`linearGradient`,`radialGradient`,`stop`,`filter`,`feTurbulence`,`feDisplacementMap`,`feGaussianBlur`,`feColorMatrix`,`feBlend`,`feMerge`,`feMergeNode`,`feOffset`,`title`]),l=[`50`,`100`,`200`,`300`,`400`,`500`,`600`,`700`,`coral`],u={foreground:`var(--foreground)`,background:`var(--background)`,card:`var(--card)`,muted:`var(--muted-foreground)`,border:`var(--border)`};function d(e,t){if(typeof e==`string`)return e;let n=e[t];if(typeof n==`string`)return n;let r=t.split(`-`)[0]?.toLowerCase();if(r){for(let[t,n]of Object.entries(e))if(t.split(`-`)[0]?.toLowerCase()===r)return n}return e[`en-US`]??Object.values(e)[0]??``}function f(e){return/url\s*\(|expression\s*\(|javascript:/i.test(e)}function p(e,t){if(e===void 0)return;let n=(typeof e==`string`?e:t===`dark`?e.dark:e.light).trim();if(n&&!f(n)){if(n.startsWith(`brand.`)){let e=n.slice(6);return l.includes(e)?e===`coral`?`var(--brand-coral)`:`var(--brand-${e})`:void 0}return u[n]||n}}function m(e){if(e&&!f(e))return e}function h(e,t){switch(e){case`body`:return t.data.body;case`date`:return t.data.date;case`day`:return t.data.day;case`day.padded`:return t.data.day?t.data.day.padStart(2,`0`):``;case`stats`:return t.data.stats;case`locale`:return t.data.locale;case`brand.product`:return t.data.brand.product;case`brand.markLight`:return t.data.brand.markLight??``;case`brand.markDark`:return t.data.brand.markDark??``;default:{if(!e.startsWith(`options.`))return;let n=t.options[e.slice(8)];return n===void 0?void 0:String(n)}}}function g(e,t){return e.replace(/\{([a-zA-Z0-9_.]+)\}/g,(e,n)=>{let r=h(n,t);return r===void 0?e:r})}function _(e,t){let n={};for(let t of e??[])t.default!==void 0&&(n[t.key]=t.default);for(let[r,i]of Object.entries(t??{})){let t=(e??[]).find(e=>e.key===r);t&&(t.type===`boolean`&&typeof i==`boolean`?n[r]=i:t.type===`text`&&typeof i==`string`?n[r]=i.slice(0,t.maxLength??500):(t.type===`color`&&typeof i==`string`||t.type===`number`&&typeof i==`number`||t.type===`enum`&&typeof i==`string`&&t.choices.some(e=>e.value===i))&&(n[r]=i))}return n}var v={width:340,height:420},y={min:200,max:1200},b=/^[a-z0-9][a-z0-9-]{0,63}$/;function x(e){return typeof e==`object`&&!!e&&!Array.isArray(e)}function S(e){if(!x(e))return!1;let t=Object.entries(e);return t.length>0&&t.every(([e,t])=>e.length>0&&typeof t==`string`)}function C(e,t){if(e===void 0)return;if(!Array.isArray(e)){t.push(`options must be an array`);return}let n=new Set,r=[];for(let i of e){if(!x(i)||typeof i.key!=`string`||!S(i.label)){t.push(`each option needs a string key and a localized label`);continue}if(n.has(i.key)){t.push(`duplicate option key "${i.key}"`);continue}n.add(i.key);let e=i.type;if(e===`enum`){if(!Array.isArray(i.choices)||i.choices.length===0||i.choices.some(e=>!x(e)||typeof e.value!=`string`||!S(e.label))){t.push(`option "${i.key}" needs non-empty choices`);continue}}else if(e!==`boolean`&&e!==`text`&&e!==`color`&&e!==`number`){t.push(`option "${i.key}" has unknown type "${String(e)}"`);continue}if(i.default!==void 0){let n=typeof i.default;if(e===`boolean`?n!==`boolean`:n!==`string`&&(e!==`number`||n!==`number`)){t.push(`option "${i.key}" default type does not match`);continue}}r.push(i)}return r}function w(e){let t=[];if(!x(e))return{contribution:null,problems:[`contribution must be an object`]};(typeof e.id!=`string`||!b.test(e.id))&&t.push(`contribution id "${String(e.id)}" must be kebab-case`),e.kind!==`document`&&e.kind!==`sandbox`&&t.push(`contribution "${String(e.id)}" kind must be document or sandbox`),S(e.name)||t.push(`contribution "${String(e.id)}" needs a localized name`);let n=e.size;if(n!==void 0&&(!x(n)||typeof n.width!=`number`||typeof n.height!=`number`||n.width<y.min||n.width>y.max||n.height<y.min||n.height>y.max)&&t.push(`contribution "${String(e.id)}" size must be within ${y.min}–${y.max}px`),e.kind===`document`&&typeof e.document!=`string`&&t.push(`contribution "${String(e.id)}" needs a document path`),e.kind===`sandbox`&&typeof e.entry!=`string`&&t.push(`contribution "${String(e.id)}" needs an entry path`),t.length>0)return{contribution:null,problems:t};let r=C(e.options,t);if(t.length>0)return{contribution:null,problems:t};let i={id:e.id,kind:e.kind===`sandbox`?`sandbox`:`document`,name:e.name,size:x(e.size)&&typeof e.size.width==`number`&&typeof e.size.height==`number`?{width:e.size.width,height:e.size.height}:v};return S(e.description)&&(i.description=e.description),typeof e.preview==`string`&&(i.preview=e.preview),r&&(i.options=r),typeof e.document==`string`&&(i.document=e.document),typeof e.entry==`string`&&(i.entry=e.entry),{contribution:i,problems:[]}}function T(e){if(x(e)&&typeof e.name==`string`)return{name:e.name,...typeof e.url==`string`?{url:e.url}:{},...typeof e.email==`string`?{email:e.email}:{}}}function E(e){let t=[];if(!x(e))return{manifest:null,problems:[`manifest must be an object`]};if(e.specVersion!==1&&t.push(`specVersion must be 1`),(typeof e.id!=`string`||!b.test(e.id))&&t.push(`id "${String(e.id)}" must be kebab-case`),(typeof e.version!=`string`||e.version.length===0||e.version.length>64)&&t.push(`version is required`),S(e.name)||t.push(`name needs a localized text table`),!x(e.contributes))t.push(`contributes is required`);else if(e.contributes.shareCardTemplates!==void 0){if(!Array.isArray(e.contributes.shareCardTemplates))t.push(`contributes.shareCardTemplates must be an array`);else{let n=new Set;for(let r of e.contributes.shareCardTemplates){let{contribution:e,problems:i}=w(r);t.push(...i),e&&(n.has(e.id)&&t.push(`duplicate card id "${e.id}"`),n.add(e.id))}}}if(t.length>0)return{manifest:null,problems:t};let n=e.contributes,r=Array.isArray(n.shareCardTemplates)?n.shareCardTemplates.map(e=>w(e).contribution).filter(e=>e!==null):[],i=T(e.author),a={specVersion:1,id:e.id,version:e.version,name:e.name,contributes:{shareCardTemplates:r}};return S(e.description)&&(a.description=e.description),i&&(a.author=i),typeof e.license==`string`&&(a.license=e.license),typeof e.defaultEnabled==`boolean`&&(a.defaultEnabled=e.defaultEnabled),typeof e.minAppVersion==`string`&&(a.minAppVersion=e.minAppVersion),{manifest:a,problems:[]}}var D={specVersion:1,id:`kosx-pack`,version:`1.0.0`,name:{"zh-CN":`KOSX 卡片`,"en-US":`KOSX cards`,ja:`KOSX カード`,ko:`KOSX 카드`,ru:`Карточки KOSX`,fr:`Cartes KOSX`,es:`Tarjetas KOSX`,ar:`بطاقات KOSX`},description:{"zh-CN":`KOSX 风格的编辑体卡片：粗黑标题、信号橙点缀，源自社区贡献。`,"en-US":`A stark editorial card with KOSX signal-orange accents; from a community contribution.`},author:{name:`Kimberlying`},license:`AGPL-3.0-only`,defaultEnabled:!1,contributes:{shareCardTemplates:[{id:`kosx-editorial`,kind:`document`,name:{"zh-CN":`KOSX`,"en-US":`KOSX`,ja:`KOSX`,ko:`KOSX`,ru:`KOSX`,fr:`KOSX`,es:`KOSX`,ar:`KOSX`},document:`cards/editorial.json`,preview:`cards/kosx-editorial.preview.png`}]}},O={specVersion:1,id:`flaremo-cards`,version:`1.2.0`,name:{"zh-CN":`基础卡片`,"en-US":`Basic cards`,ja:`ベーシックカード`,ko:`기본 카드`,ru:`Базовые карточки`,fr:`Cartes de base`,es:`Tarjetas básicas`,ar:`البطاقات الأساسية`},description:{"zh-CN":`素白、日签、票根、明信片、语录、思考笺、素墨、暮火——精心打磨的内置卡片。`,"en-US":`Plain, daily, ticket, postcard, quote, mono, zen, and ember — crafted cards bundled with FlareMo.`},author:{name:`FlareMo`},license:`AGPL-3.0-only`,defaultEnabled:!0,contributes:{shareCardTemplates:[{id:`plain`,kind:`document`,name:{"zh-CN":`素白`,"en-US":`Plain`,ja:`素白`,ko:`소백`,ru:`Простой`,fr:`Blanc`,es:`Sencillo`,ar:`أبيض`},document:`cards/plain.json`,preview:`cards/plain.preview.png`},{id:`daily`,kind:`document`,name:{"zh-CN":`日签`,"en-US":`Daily`,ja:`日签`,ko:`데일리`,ru:`Ежедневник`,fr:`Citation du jour`,es:`Diario`,ar:`يومية`},document:`cards/daily.json`,preview:`cards/daily.preview.png`},{id:`ticket`,kind:`document`,name:{"zh-CN":`票根`,"en-US":`Ticket`,ja:`票根`,ko:`티켓`,ru:`Билет`,fr:`Ticket`,es:`Billete`,ar:`تذكرة`},document:`cards/ticket.json`,preview:`cards/ticket.preview.png`},{id:`postcard`,kind:`document`,name:{"zh-CN":`明信片`,"en-US":`Postcard`,ja:`ポストカード`,ko:`엽서`,ru:`Открытка`,fr:`Carte postale`,es:`Postal`,ar:`بطاقة بريدية`},document:`cards/postcard.json`,preview:`cards/postcard.preview.png`},{id:`quote`,kind:`document`,name:{"zh-CN":`语录`,"en-US":`Quote`,ja:`語録`,ko:`어록`,ru:`Цитата`,fr:`Citation`,es:`Cita`,ar:`اقتباس`},document:`cards/quote.json`},{id:`mono`,kind:`document`,name:{"zh-CN":`思考笺`,"en-US":`Mono`,ja:`思考箋`,ko:`생각 노트`,ru:`Заметка Mono`,fr:`Feuille Mono`,es:`Nota Mono`,ar:`مذكرة مونو`},document:`cards/mono.json`},{id:`zen`,kind:`document`,name:{"zh-CN":`素墨`,"en-US":`Zen`,ja:`素墨`,ko:`소묵`,ru:`Дзен`,fr:`Zen`,es:`Zen`,ar:`زن`},document:`cards/zen.json`},{id:`ember`,kind:`document`,name:{"zh-CN":`暮火`,"en-US":`Ember`,ja:`残火`,ko:`잔불`,ru:`Уголек`,fr:`Braise`,es:`Ascuas`,ar:`جمرة`},document:`cards/ember.json`}]}},k={specVersion:1,id:`sandbox-demo`,version:`1.0.0`,name:{"zh-CN":`沙箱示例`,"en-US":`Sandbox demo`,ja:`サンドボックス例`,ko:`샌드박스 예시`,ru:`Пример песочницы`,fr:`Démo sandbox`,es:`Demo sandbox`,ar:`عرض الصندوق الرملي`},description:{"zh-CN":`一张用自由 HTML/Canvas 绘制的邮戳卡，演示沙箱插件能力。`,"en-US":`A postmark card drawn with free-form HTML/Canvas, demonstrating sandbox plugins.`},author:{name:`FlareMo`},license:`AGPL-3.0-only`,defaultEnabled:!0,contributes:{shareCardTemplates:[{id:`stamp`,kind:`sandbox`,name:{"zh-CN":`邮戳`,"en-US":`Postmark`,ja:`消印`,ko:`소인`,ru:`Штемпель`,fr:`Cachet`,es:`Matasellos`,ar:`ختم بريدي`},entry:`cards/stamp/index.html`,options:[{key:`accent`,type:`color`,label:{"zh-CN":`邮戳颜色`,"en-US":`Postmark color`,ja:`消印の色`,ko:`소인 색상`,ru:`Цвет штемпеля`,fr:`Couleur du cachet`,es:`Color del matasellos`,ar:`لون الختم`},default:`#c2410c`}],preview:`cards/stamp.preview.png`}]}},A={specVersion:1,root:{type:`column`,style:{minHeight:`100%`,background:{light:`#f6f5f0`,dark:`#17181a`},color:{light:`#111111`,dark:`#f5f5f7`},borderWidth:1,borderColor:{light:`#e2ded5`,dark:`#2a2b2e`},borderRadius:6},children:[{type:`column`,style:{height:3,background:`brand.500`}},{type:`row`,style:{justify:`space-between`,align:`center`,paddingX:28,paddingTop:22},children:[{type:`text`,text:`EDITORIAL`,style:{font:{family:`heading`,size:10,weight:700,letterSpacing:1.6,uppercase:!0,color:{light:`#71717a`,dark:`#a1a1aa`}}}},{type:`text`,text:`{date}`,style:{font:{size:11,color:{light:`#71717a`,dark:`#a1a1aa`}}}}]},{type:`divider`,style:{marginLeft:28,marginRight:28,marginTop:14,color:{light:`#d4cfc5`,dark:`#333538`},opacity:.8}},{type:`text`,text:`{body}`,style:{flex:1,paddingX:28,paddingY:22,font:{size:15,lineHeight:1.8}}},{type:`row`,style:{width:`100%`,justify:`end`,align:`center`,paddingX:28,paddingBottom:22},children:[{type:`spacer`,style:{width:24,height:1,background:{light:`#d4cfc5`,dark:`#333538`},opacity:.8}}]}]}},j={specVersion:1,root:{type:`column`,style:{minHeight:`100%`,padding:30,background:{light:`#fdfbf7`,dark:`#191816`},color:{light:`#292524`,dark:`#f5f5f4`},borderWidth:1,borderColor:{light:`#eee8de`,dark:`#2a2724`},borderRadius:8},children:[{type:`row`,style:{width:`100%`,align:`center`,gap:10},children:[{type:`column`,style:{background:{light:`#fff7ed`,dark:`#2c1d15`},borderWidth:1,borderColor:{light:`#fed7aa`,dark:`#4a2d1d`},borderRadius:4,paddingX:7,paddingY:3,align:`center`,justify:`center`},children:[{type:`text`,text:`{day.padded}`,style:{font:{family:`heading`,size:13,weight:700,color:`brand.600`}}}]},{type:`text`,text:`{date}`,style:{font:{size:12,color:{light:`#78716c`,dark:`#a8a29e`}}}}]},{type:`text`,text:`{body}`,style:{flex:1,marginTop:24,font:{size:15,lineHeight:1.8}}},{type:`row`,style:{width:`100%`,justify:`end`,align:`center`,marginTop:24},children:[{type:`spacer`,style:{width:16,height:2,background:`brand.500`,opacity:.45,borderRadius:1}}]}]}},M={specVersion:1,root:{type:`column`,style:{minHeight:`100%`,background:{light:`#fdf8f4`,dark:`#1a1614`},color:{light:`#2c1d16`,dark:`#faefe8`},borderWidth:1,borderColor:{light:`#f4e7dd`,dark:`#36261f`},borderRadius:8},children:[{type:`column`,style:{height:2,background:`brand.500`,opacity:.8}},{type:`row`,style:{width:`100%`,justify:`space-between`,align:`center`,paddingX:28,paddingTop:22},children:[{type:`spacer`,style:{width:5,height:5,borderRadius:9999,background:`brand.500`,opacity:.75}},{type:`text`,text:`{date}`,style:{font:{size:11,color:{light:`#9a6b52`,dark:`#c2957e`}}}}]},{type:`text`,text:`{body}`,style:{flex:1,paddingX:28,marginTop:20,font:{size:15,lineHeight:1.8}}},{type:`row`,style:{width:`100%`,justify:`end`,align:`center`,paddingX:28,paddingBottom:22,marginTop:20},children:[{type:`spacer`,style:{width:20,height:1,background:`brand.500`,opacity:.5}}]}]}},N={specVersion:1,root:{type:`column`,style:{minHeight:`100%`,padding:30,background:{light:`#f8f9fa`,dark:`#121314`},color:{light:`#1e293b`,dark:`#e2e8f0`},borderWidth:1,borderColor:{light:`#e4e7eb`,dark:`#25272a`},borderRadius:6},children:[{type:`row`,style:{width:`100%`,justify:`space-between`,align:`center`},children:[{type:`text`,text:`// {date}`,style:{font:{family:`mono`,size:11,color:{light:`#64748b`,dark:`#94a3b8`}}}}]},{type:`divider`,style:{marginTop:14,color:{light:`#e2e8f0`,dark:`#25272a`},opacity:.8}},{type:`text`,text:`{body}`,style:{flex:1,marginTop:20,font:{family:`mono`,size:13.5,lineHeight:1.8}}},{type:`row`,style:{width:`100%`,align:`center`,marginTop:20},children:[{type:`spacer`,style:{width:8,height:14,background:`brand.500`,opacity:.75}}]}]}},P={specVersion:1,root:{type:`column`,style:{minHeight:`100%`,padding:32,background:{light:`#faf9f6`,dark:`#18181b`},color:{light:`#27272a`,dark:`#f4f4f5`},borderWidth:1,borderColor:{light:`#e8e5df`,dark:`#27272a`},borderRadius:8},children:[{type:`row`,style:{width:`100%`,justify:`end`,align:`center`},children:[{type:`text`,text:`{date}`,style:{font:{size:11,color:{light:`#a1a1aa`,dark:`#71717a`}}}}]},{type:`text`,text:`{body}`,style:{flex:1,marginTop:24,font:{size:15,lineHeight:1.8}}},{type:`row`,style:{width:`100%`,align:`center`,marginTop:24},children:[{type:`spacer`,style:{width:20,height:1,background:{light:`#d4d4d8`,dark:`#3f3f46`},opacity:.8}}]}]}},F={specVersion:1,root:{type:`column`,style:{minHeight:`100%`,background:{light:`#fbf9f4`,dark:`#1a1918`},color:{light:`#262422`,dark:`#f4f1ea`},borderWidth:1,borderColor:{light:`#e9e4db`,dark:`#2c2a28`},borderRadius:6},children:[{type:`row`,style:{width:`100%`,justify:`space-between`,align:`start`,paddingX:30,paddingTop:26},children:[{type:`text`,text:`{date}`,style:{font:{size:11,color:{light:`#8c857b`,dark:`#a8a196`}}}},{type:`column`,style:{width:36,height:42,borderWidth:1,borderColor:{light:`#d5cdc1`,dark:`#3d3935`},borderRadius:2,align:`center`,justify:`center`,opacity:.75},children:[{type:`text`,text:`{day.padded}`,style:{font:{family:`serif`,size:13,weight:600,color:{light:`#6e665c`,dark:`#bfb7aa`}}}}]}]},{type:`text`,text:`{body}`,style:{flex:1,paddingX:30,marginTop:20,font:{family:`serif`,size:15,lineHeight:1.8}}},{type:`row`,style:{width:`100%`,justify:`end`,align:`center`,paddingX:30,paddingBottom:24,marginTop:20},children:[{type:`spacer`,style:{width:24,height:1,background:{light:`#d5cdc1`,dark:`#3d3935`},opacity:.6}}]}]}},I={specVersion:1,root:{type:`column`,style:{minHeight:`100%`,padding:32,background:{light:`#faf9f5`,dark:`#18181b`},color:{light:`#1f1e1d`,dark:`#f5f3ef`},borderWidth:1,borderColor:{light:`#e8e4dc`,dark:`#2a2a2d`},borderRadius:8},children:[{type:`row`,style:{width:`100%`,justify:`space-between`,align:`start`},children:[{type:`text`,text:`“`,style:{opacity:.3,font:{family:`serif`,size:46,weight:700,lineHeight:.8,color:`brand.500`}}},{type:`text`,text:`{date}`,style:{font:{size:11,color:{light:`#a1a1aa`,dark:`#71717a`}}}}]},{type:`text`,text:`{body}`,style:{flex:1,marginTop:14,font:{family:`serif`,size:16,lineHeight:1.8}}},{type:`row`,style:{width:`100%`,justify:`end`,align:`center`,marginTop:20},children:[{type:`spacer`,style:{width:20,height:1,background:{light:`#d4cfc5`,dark:`#3f3f46`},opacity:.8}}]}]}},L={specVersion:1,root:{type:`column`,style:{minHeight:`100%`,background:{light:`#f9f8f5`,dark:`#18181b`},borderWidth:1,borderColor:{light:`#e4dfd5`,dark:`#2d2d30`},borderRadius:8,color:{light:`#262626`,dark:`#f5f5f5`}},children:[{type:`row`,style:{width:`100%`,justify:`space-between`,align:`center`,paddingX:28,paddingY:16},children:[{type:`text`,text:`STUB`,style:{font:{family:`mono`,size:10,weight:600,letterSpacing:1.5,uppercase:!0,color:{light:`#a8a29e`,dark:`#78716c`}}}},{type:`text`,text:`{date}`,style:{font:{size:11,color:{light:`#78716c`,dark:`#a8a29e`}}}}]},{type:`divider`,style:{marginLeft:20,marginRight:20,borderStyle:`dashed`,color:{light:`#d8d3c7`,dark:`#3a3a3e`},opacity:.8}},{type:`text`,text:`{body}`,style:{flex:1,paddingX:28,paddingY:24,font:{size:15,lineHeight:1.8}}},{type:`row`,style:{width:`100%`,justify:`end`,align:`center`,paddingX:28,paddingBottom:20},children:[{type:`spacer`,style:{width:24,height:1,background:{light:`#d4d4d8`,dark:`#3f3f46`},opacity:.6}}]}]}},R={specVersion:1,root:{type:`column`,style:{minHeight:`100%`,padding:34,background:{light:`#f6f4ee`,dark:`#161718`},color:{light:`#21201d`,dark:`#f2eee5`},borderWidth:1,borderColor:{light:`#e5e1d5`,dark:`#27292b`},borderRadius:4},children:[{type:`row`,style:{width:`100%`,justify:`end`,align:`center`},children:[{type:`text`,text:`{date}`,style:{font:{family:`serif`,size:11,color:{light:`#857f74`,dark:`#9e978b`}}}}]},{type:`text`,text:`{body}`,style:{flex:1,marginTop:24,font:{family:`serif`,size:15.5,lineHeight:1.8}}},{type:`row`,style:{width:`100%`,justify:`center`,align:`center`,marginTop:28},children:[{type:`spacer`,style:{width:28,height:1,background:{light:`#b8b2a5`,dark:`#4a4c4f`},opacity:.6}}]}]}},z=`<!doctype html>\r
<html>\r
<head>\r
<meta charset="utf-8">\r
<style>\r
  html, body { margin: 0; padding: 0; background: transparent; }\r
  #card {\r
    width: 340px;\r
    min-height: 420px;\r
    box-sizing: border-box;\r
    background: #fbf8f1;\r
    color: #2f2b26;\r
    padding: 26px 28px;\r
    display: flex;\r
    flex-direction: column;\r
    /* No Han face is named on purpose: the host stamps lang on this\r
       document, and the generic serif resolves per script from it. */\r
    font-family: Georgia, "Times New Roman", serif;\r
  }\r
  .head { display: flex; justify-content: space-between; align-items: flex-start; }\r
  .meta {\r
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\r
    font-size: 11px;\r
    line-height: 1.6;\r
    text-transform: uppercase;\r
    color: #8a8072;\r
  }\r
  .postmark { position: relative; width: 104px; height: 104px; margin: -10px -8px 0 0; }\r
  .postmark canvas, .postmark .ring, .postmark .stamp-text {\r
    position: absolute;\r
    inset: 0;\r
    width: 104px;\r
    height: 104px;\r
  }\r
  .postmark .ring {\r
    inset: 10px;\r
    width: 84px;\r
    height: 84px;\r
    border: 2px solid var(--ink, #c2410c);\r
    border-radius: 50%;\r
    opacity: 0.72;\r
  }\r
  .postmark .stamp-text {\r
    display: flex;\r
    align-items: center;\r
    justify-content: center;\r
    text-align: center;\r
    white-space: pre-line;\r
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\r
    font-size: 10px;\r
    line-height: 1.5;\r
    /* This line reads "已阅" for zh-CN and "FILED" otherwise; tracking tuned\r
       for the Latin branch would spread the Han one. */\r
    text-transform: uppercase;\r
    color: var(--ink, #c2410c);\r
    opacity: 0.85;\r
  }\r
  .body {\r
    flex: 1;\r
    margin-top: 16px;\r
    font-size: 15px;\r
    line-height: 1.8;\r
    word-break: break-word;\r
  }\r
  .para {\r
    white-space: pre-wrap;\r
  }\r
  .para + .para {\r
    margin-top: 8px;\r
  }\r
  .foot {\r
    display: flex;\r
    justify-content: space-between;\r
    align-items: flex-end;\r
    gap: 12px;\r
    border-top: 1px dashed #d8cfbe;\r
    padding-top: 12px;\r
    margin-top: 24px;\r
  }\r
</style>\r
</head>\r
<body>\r
<div id="card">\r
  <div class="head">\r
    <div class="meta" id="date"></div>\r
    <div class="postmark">\r
      <canvas id="waves" height="208" width="208"></canvas>\r
      <div class="ring"></div>\r
      <div class="stamp-text" id="stamp-text"></div>\r
    </div>\r
  </div>\r
  <div class="body" id="body"></div>\r
  <div class="foot">\r
    <div class="meta" id="stats"></div>\r
    <div class="meta" id="brand"></div>\r
  </div>\r
</div>\r
<script>\r
  window.__flaremoCaptureTarget = document.getElementById("card");\r
\r
  function drawWaves(canvas, color) {\r
    var ctx = canvas.getContext("2d");\r
    ctx.clearRect(0, 0, canvas.width, canvas.height);\r
    ctx.strokeStyle = color;\r
    ctx.globalAlpha = 0.45;\r
    ctx.lineWidth = 3;\r
    for (var i = 0; i < 4; i += 1) {\r
      var y = 48 + i * 36;\r
      ctx.beginPath();\r
      for (var x = -12; x <= 220; x += 4) {\r
        var wave = Math.sin((x + i * 30) / 26) * 6;\r
        if (x === -12) {\r
          ctx.moveTo(x, y + wave);\r
        } else {\r
          ctx.lineTo(x, y + wave);\r
        }\r
      }\r
      ctx.stroke();\r
    }\r
  }\r
\r
  window.__flaremoOnUpdate = function (payload) {\r
    var data = (payload && payload.data) || {};\r
    var options = (payload && payload.options) || {};\r
    var brand = data.brand || {};\r
    var ink = options.accent || "#c2410c";\r
    document.getElementById("date").textContent = data.date || "";\r
    var bodyEl = document.getElementById("body");\r
    bodyEl.innerHTML = "";\r
    var rawBody = data.body || "";\r
    var paras = rawBody.split(/\\n\\n+/).filter(Boolean);\r
    if (paras.length === 0) {\r
      bodyEl.textContent = "";\r
    } else {\r
      for (var p = 0; p < paras.length; p += 1) {\r
        var pEl = document.createElement("div");\r
        pEl.className = "para";\r
        pEl.textContent = paras[p];\r
        bodyEl.appendChild(pEl);\r
      }\r
    }\r
    document.getElementById("stats").textContent = data.stats || "";\r
    document.getElementById("brand").textContent = brand.product || "";\r
    document.getElementById("stamp-text").textContent =\r
      (data.locale === "zh-CN" ? "已阅" : "FILED") + "\\n" + (data.day || "");\r
    document.getElementById("card").style.setProperty("--ink", ink);\r
    drawWaves(document.getElementById("waves"), ink);\r
  };\r
<\/script>\r
</body>\r
</html>\r
`,B=Object.assign({"../community/kosx-pack/plugin.json":D,"../official/flaremo-cards/plugin.json":O,"../official/sandbox-demo/plugin.json":k}),V=Object.assign({"../community/kosx-pack/cards/editorial.json":A,"../official/flaremo-cards/cards/daily.json":j,"../official/flaremo-cards/cards/ember.json":M,"../official/flaremo-cards/cards/mono.json":N,"../official/flaremo-cards/cards/plain.json":P,"../official/flaremo-cards/cards/postcard.json":F,"../official/flaremo-cards/cards/quote.json":I,"../official/flaremo-cards/cards/ticket.json":L,"../official/flaremo-cards/cards/zen.json":R}),H=Object.assign({"../official/sandbox-demo/cards/stamp/index.html":z}),U=null;function W(){if(U)return U;let e=[],t=new Map,n=Object.entries(B).sort(([e],[t])=>e.localeCompare(t));for(let[r,i]of n){let n=r.startsWith(`../official/`)?`official`:`community`,a=r.slice(0,-11),o=a.replace(/\/$/,``).split(`/`).pop()??``,{manifest:s,problems:c}=E(i);if(!s)throw Error(`${r}: ${c.join(`; `)}`);let l=s;if(l.id!==o)throw Error(`${r}: manifest id "${l.id}" must match the folder name "${o}"`);let u=[];for(let e of l.contributes.shareCardTemplates??[]){let i=t.get(e.id);if(i)throw Error(`${r}: card id "${e.id}" is already used by ${i}`);t.set(e.id,l.id);let o={pluginId:l.id,pluginVersion:l.version,tier:n};if(e.kind===`document`){let t=V[a+(e.document??``)];if(!x(t))throw Error(`${r}: card "${e.id}" document not found: ${String(e.document)}`);let n=t;if(n.specVersion!==1)throw Error(`${r}: card "${e.id}" document specVersion must be 1`);u.push({...e,...o,payload:{kind:`document`,document:n}})}else{let t=H[a+(e.entry??``)];if(typeof t!=`string`)throw Error(`${r}: card "${e.id}" entry not found: ${String(e.entry)}`);u.push({...e,...o,payload:{kind:`sandbox`,html:t}})}}e.push({manifest:l,tier:n,cards:u})}return U=e,e}function G(){return[...W()].sort((e,t)=>e.tier===t.tier?e.manifest.id.localeCompare(t.manifest.id):e.tier===`official`?-1:1)}function K(e,t){return`/api/app/plugins/assets/${e}/${t}`}function q(){return G().flatMap(e=>e.cards.map(t=>({id:t.id,pluginId:e.manifest.id,pluginVersion:e.manifest.version,pluginTier:e.tier,source:`bundled`,kind:t.kind,name:t.name,...t.description?{description:t.description}:{},size:t.size??v,...t.options?{options:t.options}:{},bundled:t})))}function J(e){let t=q(),n=new Set(t.map(e=>e.id)),r=[];for(let t of e?.installed??[]){let{manifest:e}=E(t.manifest);if(!e||e.id!==t.id)continue;let i=K(t.id,t.version);for(let a of e.contributes.shareCardTemplates??[])n.has(a.id)||r.push({id:a.id,pluginId:t.id,pluginVersion:t.version,pluginTier:`community`,source:`installed`,kind:a.kind,name:a.name,...a.description?{description:a.description}:{},size:a.size??v,...a.options?{options:a.options}:{},assetBase:i,payloadPath:a.kind===`document`?a.document:a.entry})}return[...t,...r]}function Y(e){let t=J(e),n=t.filter(e=>e.source===`bundled`&&e.pluginTier===`official`),r=n.length>0?n:t;if(!e)return r;let i=new Set(e.enabledPlugins),a=new Set(e.disabledPlugins),o=new Set(e.cards.hidden),s=e=>e.source===`bundled`&&e.pluginTier===`official`,c=new Map(t.map((e,t)=>[e.id,t])),l=t.filter(e=>(i.has(e.pluginId)?!0:!a.has(e.pluginId)&&s(e))&&!o.has(e.id));if(l.length===0)return r;let u=new Map(e.cards.order.map((e,t)=>[e,t]));return[...l].sort((e,t)=>{let n=u.get(e.id),r=u.get(t.id);return n!==void 0&&r!==void 0?n-r:n===void 0?r===void 0?(c.get(e.id)??0)-(c.get(t.id)??0):1:-1})}async function X(e){if(e.source===`bundled`&&e.bundled)return e.bundled.payload;if(!e.assetBase||!e.payloadPath)throw Error(`installed card is missing its asset path`);let t=`${e.assetBase}/${e.payloadPath}`,n=await fetch(t,{credentials:`same-origin`});if(!n.ok)throw Error(`could not load the card (${n.status})`);if(e.kind===`document`){let e=await n.json();if(!e||typeof e!=`object`||!e.root)throw Error(`card document is malformed`);return{kind:`document`,document:e}}let r=await n.text();if(!r.trim())throw Error(`card entry is empty`);return{kind:`sandbox`,html:r}}export{r as _,c as a,m as c,_ as d,n as f,o as g,a as h,G as i,p as l,t as m,X as n,g as o,i as p,Y as r,f as s,J as t,d as u,s as v};