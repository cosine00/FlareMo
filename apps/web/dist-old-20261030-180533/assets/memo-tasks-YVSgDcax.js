var e=/^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\](?:\s.*)?)$/;function t(t){return t.split(`
`).flatMap((t,n)=>{let r=e.exec(t);return r?[{checked:r[2]!==` `,lineIndex:n,text:r[3].replace(/^\]\s*/,``).trim()}]:[]})}function n(t,n){let r=t.split(`
`),i=r[n];if(!i)return null;let a=e.exec(i);return a?(r[n]=`${a[1]}${a[2]===` `?`x`:` `}${a[3]}`,r.join(`
`)):null}function r(t){let n=0;for(let r of t.split(`
`))e.test(r)&&(n+=1);return n}export{t as n,n as r,r as t};