// ==UserScript==
// @name         AI Form Autofiller
// @namespace    cxumol
// @version      1.1
// @description  General purpose form autofiller 通用型一键智能填表, 需要先在脚本设置选项单中预设填表内容和 LLM API
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @require      https://cdn.jsdelivr.net/npm/fuzzysort@3.1.0/fuzzysort.min.js
// ==/UserScript==

(function() {
'use strict';
const $ = document.querySelector.bind(document), $$ = document.querySelectorAll.bind(document), MAX_RETRY = 3;

// Compact API call function
const oai = async (api, msg, temp = 0.6) => {
    var res = await fetch(api.base + '/chat/completions', { method: 'POST', headers: { 'Authorization': 'Bearer ' + api.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ "model": api.model, "messages": [{ "role": "system", "content": msg.sys }, { "role": "user", "content": msg.user }], temperature: temp }) });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    var j = await res.text();
    try { return JSON.parse(j).choices?.[0]?.message?.content.trim() || (() => { throw new Error("No content") })(); } catch (e) { console.error("Error parsing JSON:", j); throw e; }
};

// Flatten nested objects
const flattenObject = (obj, prefix = '') => Object.keys(obj).reduce((acc, k) => {
    const pre = prefix.length ? prefix + '.' : '';
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {Object.assign(acc, flattenObject(obj[k], pre + k))}
    else if (Array.isArray(obj[k])) {obj[k].forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {Object.assign(acc, flattenObject(item, `${pre}${k}.${index}`));} else {acc[`${pre}${k}.${index}`] = item;}
    })} else acc[pre + k] = obj[k];
    return acc;
}, {});

// Config management
GM_registerMenuCommand('⚙ Edit User Data', () => {
    const dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;border:1px solid black;padding:20px;z-index:10000;width:80%;max-width:600px;';
    document.body.appendChild(dialog);
    dialog.innerHTML = `<label>User Data:</label><textarea style="width:100%;height:200px;margin-bottom:10px;">${JSON.stringify(GM_getValue('userData', {}), null, 2)}</textarea>
    <label>API Config:</label><textarea style="width:100%;height:100px;margin-bottom:10px;">${JSON.stringify(GM_getValue('apiConfig',{"base":"https://api.example/v1","key":"sk-","model":"gpt"}),null,2)}</textarea>
    <div style="text-align:right;"><button style="margin-left:10px;">Save</button><button style="margin-left:10px;">Cancel</button></div>`;
    const buttons = dialog.querySelectorAll('button');
    buttons[0].onclick = () => {try{var[area0, area1]=dialog.querySelectorAll('textarea');GM_setValue('userData',JSON.parse(area0.value));GM_setValue('apiConfig',JSON.parse(area1.value));dialog.remove();}catch(e){alert('Invalid JSON!');}};
    buttons[1].onclick = () => dialog.remove();
});

// Form injection
const addAutoFillButton = form => {
    if (form.querySelectorAll('input,textarea,select').length < 5) return; // Requirement 3: Don't add to small forms
    const btn = document.createElement('button');
    btn.textContent = '🚀 Autofill Form';
    btn.style = 'background:#4CAF50;color:white;padding:8px;border:0;border-radius:4px;margin:10px 0;cursor:pointer;';
    btn.onclick = () => { autofill(form); return false; };
    form.insertBefore(btn, form.firstChild);
};

// Matching logic
const normalize = str => str.toLowerCase().replace(/[\s_-]+/g, '');
const findBestMatch = (formKeys, userData) => {
    const userKeys = Object.keys(userData).map(k => ({ raw: k, norm: normalize(k) }));
    for (const key of formKeys) if (userData[key]) return key; // Exact match
    return formKeys.reduce((a, k) => {
        const res = fuzzysort.go(k, userKeys, { key: 'norm', threshold: -Infinity })[0];
        return res && res.score > a.score ? res : a;
    }, { score: -1 }).obj?.raw;
};

// Core functionality
const autofill = async form => {
    const userData = GM_getValue('userData', {}), apiConfig = GM_getValue('apiConfig', { "base": "https://api.example/v1", "key": "sk-", "model": "gpt" }), flatUserData = flattenObject(userData);
    const matchedKeys = new Set();
    console.log(flattenObject);

    // Initial Matching
    form.querySelectorAll('input,textarea,select').forEach(el => {
        if (el.disabled || ['hidden'].includes(el.type)) return;
        const match = findBestMatch([el.name, el.id, el.placeholder, ...Array.from(document.querySelectorAll(`label[for="${el.id}"]`)).map(l => l.textContent)].filter(Boolean).map(normalize), flatUserData);
        if (!match) return;

        if (el.type === 'radio' || el.type === 'checkbox') {
            el.checked = !!flatUserData[match] === (el.value === 'true' || el.value === '1' || el.value.toLowerCase() === match.toLowerCase());
        } else {
            el.value = Array.isArray(flatUserData[match]) ? flatUserData[match].join(', ') : flatUserData[match];
        }
        matchedKeys.add(match);
    });

    // LLM Matching
    const unmatchedFormKeys = Array.from((form || document).querySelectorAll('input,textarea,select')).filter(el => !el.disabled && !['radio', 'checkbox', 'hidden'].includes(el.type) && !el.value).map(el => ({ raw: el.name, norm: normalize(el.name) }));
    const privacyRegex = /name|email|phone|address|tel|mobile/i;
    const filteredUserData = Object.fromEntries(Object.entries(flatUserData).filter(([key]) => !matchedKeys.has(key) && !privacyRegex.test(key)));

    if (unmatchedFormKeys.length > 0 && Object.keys(filteredUserData).length > 0) {
        const sysPrompt = `You are a form-filling assistant. Match user data to form fields. Return a JSON object where keys are form field names and values are the corresponding user data. Only include matched pairs. Do not make up information. Output must be valid JSON. Example: {"formKey1":"matcheddata1","formKey2":"matcheddata2"}`;
        const userPrompt = `Form Fields: ${JSON.stringify(unmatchedFormKeys.map(k => k.raw))}\nUser Data: ${JSON.stringify(filteredUserData)}`;
        let llmResult = null;
        for (let i = 0; i < MAX_RETRY; i++) {
            try { llmResult = await oai(apiConfig, { sys: sysPrompt, user: userPrompt }); llmResult = JSON.parse(llmResult); break; } catch (e) { console.error(`LLM call failed (attempt ${i + 1}/${MAX_RETRY}):`, e); }
        }
        if (llmResult) form.querySelectorAll('input,textarea,select').forEach(el => { if (llmResult[el.name]) el.value = llmResult[el.name]; });
    }
};

// Initialize
$$('form').forEach(addAutoFillButton);
new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => n.tagName === 'FORM' && n.querySelectorAll('input,textarea,select').length >= 5 && addAutoFillButton(n)))).observe(document.body, { childList: true, subtree: true }); // Requirement 3: Check in observer too
})();
