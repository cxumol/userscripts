// ==UserScript==
// @name         DeepSeek Playground UI
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  全屏双栏界面：左栏输入区（恒定编辑状态），右栏输出区。Enter 换行，Ctrl+Enter 发送。
// @description:zh-CN 全屏双栏界面：左栏输入区（恒定编辑状态），右栏输出区。Enter 换行，Ctrl+Enter 发送。
// @description:zh-TW 全螢幕雙欄界面：左欄輸入區（恆定編輯狀態），右欄輸出區。Enter 換行，Ctrl+Enter 傳送。
// @description:en Fullscreen dual-panel UI: left panel for input (always editable), right panel for output. Enter for newline, Ctrl+Enter to send.
// @match        https://chat.deepseek.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=deepseek.com
// @grant        GM_addStyle
// @run-at       context-menu
// @license MIT
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'ds_playground_ui';
    let isPlaygroundUI = localStorage.getItem(STORAGE_KEY) === 'true';
    let lastEditClickTime = 0;

    // 样式注入
    GM_addStyle(`
        /* 切换按钮样式 */
        #ds-playground-toggle {
            position: fixed;
            top: 12px;
            right: 140px;
            z-index: 9999;
            padding: 6px 12px;
            background-color: var(--dsw-alias-bg-layer-2, #ffffff);
            border: 1px solid var(--dsw-alias-brand-primary, #4d6bfe);
            color: var(--dsw-alias-brand-primary, #4d6bfe);
            border-radius: 8px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 2px 6px rgba(0,0,0,0.05);
        }
        #ds-playground-toggle:hover, #ds-playground-toggle.active {
            background-color: var(--dsw-alias-brand-primary, #4d6bfe);
            color: #fff;
        }

        /* 锁定页面滚动与高度 */
        body.playground-mode, body.playground-mode #root {
            overflow: hidden !important;
            height: 100% !important;
        }
        body.playground-mode .ds-virtual-list {
            height: calc(100vh - 60px) !important;
            overflow: hidden !important;
        }
        body.playground-mode .ds-virtual-list-items {
            min-height: 96% !important;
            height: 96% !important;
            padding: 0 !important;
        }
        body.playground-mode .ds-virtual-list-visible-items {
            position: relative !important;
            transform: none !important;
            height: 96% !important;
            min-height: 96% !important;
        }

        /* 左右双面板使用绝对定位，避免 React 动态尺寸干扰 */
        /* 左栏：用户输入区 */
        body.playground-mode [data-virtual-list-item-key]:nth-of-type(1) {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 50% !important;
            height: 100% !important;
            padding: 24px 12px 24px 24px !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
        }
        /* 右栏：模型输出区 */
        body.playground-mode [data-virtual-list-item-key]:nth-of-type(2) {
            position: absolute !important;
            top: 0 !important;
            right: 0 !important;
            left: 50% !important;
            width: 50% !important;
            height: 100% !important;
            padding: 24px 24px 24px 12px !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
        }

        /* 隐藏第一个和第二个以外的所有列表项 */
        body.playground-mode [data-virtual-list-item-key]:not(:nth-of-type(1)):not(:nth-of-type(2)) {
            display: none !important;
        }

        /* 左栏内部布局调整 */
        body.playground-mode [data-virtual-list-item-key]:nth-of-type(1):has(.ds-textarea) > .ds-message {
            display: none !important;
        }

        body.playground-mode [data-virtual-list-item-key]:nth-of-type(1) > div:not(.ds-message) {
            flex: 1 1 auto !important;
            height: 100% !important;
            max-height: none !important;
            display: flex !important;
            flex-direction: column !important;
        }

        body.playground-mode [data-virtual-list-item-key]:nth-of-type(1) .ds-textarea {
            flex: 1 1 auto !important;
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            max-width: none !important;
            border-radius: 12px !important;
        }

        body.playground-mode [data-virtual-list-item-key]:nth-of-type(1) .ds-textarea > div:has(textarea) {
            flex: 1 1 auto !important;
            height: 100% !important;
            max-height: none !important;
            position: relative !important;
        }

        body.playground-mode [data-virtual-list-item-key]:nth-of-type(1) textarea[name="user query"] {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            max-height: none !important;
            resize: none !important;
            overflow-y: auto !important;
        }

        /* 阻止镜像元素影响布局 */
        body.playground-mode [data-virtual-list-item-key]:nth-of-type(1) .ds-textarea__mirror {
            display: none !important;
        }

        /* 右栏独立滚动条 */
        body.playground-mode [data-virtual-list-item-key]:nth-of-type(2) > .ds-message {
            flex: 1 1 auto !important;
            height: 100% !important;
            overflow-y: auto !important;
            background: var(--dsw-alias-bg-layer-1, #f9f9f9) !important;
            border-radius: 12px !important;
            padding: 24px !important;
            border: 1px solid var(--dsw-alias-border-1, #eaeaea) !important;
            max-width: none !important;
            margin: 0 !important;
        }

        /* 隐藏页面底部的输入框区域 */
        body.playground-mode div:has(> textarea[name="search"]) {
            display: none !important;
        }
    `);

    // 检查是否存在至少一轮对话
    function hasConversation() {
        // 通过是否存在消息组件判断是否有对话记录
        const messages = document.querySelectorAll('.ds-message');
        return messages.length > 0;
    }

    // 切换模式时的检查与状态同步
    function setPlaygroundUIState(enable) {
        if (enable && !hasConversation()) {
            alert("请先进行一轮对话。Playground UI 只能从已有的对话切入");
            return false;
        }
        if (isPlaygroundUI !== enable) {
            isPlaygroundUI = enable;
            localStorage.setItem(STORAGE_KEY, isPlaygroundUI);
            updateToggleButton();
            applyUI();
        }
        return true;
    }

    function updateToggleButton() {
        const btn = document.getElementById('ds-playground-toggle');
        if (btn) {
            btn.innerHTML = isPlaygroundUI ? '🛠️ Playground UI: ON' : '🛠️ Playground UI: OFF';
            btn.className = isPlaygroundUI ? 'active' : '';
        }
    }

    function applyUI() {
        if (isPlaygroundUI) {
            document.body.classList.add('playground-mode');
            forceEditMode();
        } else {
            document.body.classList.remove('playground-mode');
            lastEditClickTime = 0;
        }
    }

    function initToggleUI() {
        if (document.getElementById('ds-playground-toggle')) return;
        const btn = document.createElement('button');
        btn.id = 'ds-playground-toggle';
        btn.innerHTML = isPlaygroundUI ? '🛠️ Playground UI: ON' : '🛠️ Playground UI: OFF';
        btn.className = isPlaygroundUI ? 'active' : '';

        btn.addEventListener('click', () => {
            // 尝试切换状态，若不允许则保持原状态
            const newState = !isPlaygroundUI;
            if (newState && !hasConversation()) {
                alert("请先进行一轮对话。Playground UI 只能从已有的对话切入");
                return;
            }
            isPlaygroundUI = newState;
            localStorage.setItem(STORAGE_KEY, isPlaygroundUI);
            updateToggleButton();
            applyUI();
        });

        document.body.appendChild(btn);
        applyUI();
    }

    // 强制进入编辑模式（点击铅笔图标）
    function forceEditMode() {
        if (!isPlaygroundUI) return;

        const leftPanel = document.querySelector('[data-virtual-list-item-key]:nth-of-type(1)');
        if (!leftPanel) return;

        const isEditing = leftPanel.querySelector('textarea[name="user query"]');
        if (isEditing) return;

        // 防抖：避免短时间内重复点击
        if (Date.now() - lastEditClickTime < 1000) return;

        const svgs = leftPanel.querySelectorAll('svg');
        for (let svg of svgs) {
            // 依据 SVG 路径特征定位编辑按钮
            if (svg.innerHTML.includes('9.94076')) {
                const editBtn = svg.closest('[role="button"]');
                if (editBtn) {
                    lastEditClickTime = Date.now();
                    editBtn.click();
                    break;
                }
            }
        }
    }

    // 在文本框中插入内容
    function insertTextAtCursor(textarea, text) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const textBefore = textarea.value.substring(0, start);
        const textAfter = textarea.value.substring(end, textarea.value.length);

        nativeSetter.call(textarea, textBefore + text + textAfter);
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 触发发送消息
    function triggerSend(textarea) {
        const container = textarea.closest('[data-virtual-list-item-key]:nth-of-type(1)');
        if (!container) return;

        const spans = container.querySelectorAll('span');
        for (let span of spans) {
            if (span.textContent.trim() === '发送') {
                const sendBtn = span.closest('[role="button"]');
                if (sendBtn) {
                    sendBtn.click();
                    break;
                }
            }
        }
    }

    // 键盘事件处理
    document.addEventListener('keydown', (e) => {
        if (!isPlaygroundUI) return;

        const target = e.target;
        if (target.tagName === 'TEXTAREA' && target.name === 'user query') {
            // Enter 换行，不发送
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                insertTextAtCursor(target, '\n');
            }
            // Ctrl+Enter 发送
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.stopPropagation();
                triggerSend(target);
            }
        }
    }, true);

    // 监听 DOM 变化，保持编辑模式
    const observer = new MutationObserver(() => {
        if (isPlaygroundUI) {
            requestAnimationFrame(() => forceEditMode());
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 启动 UI
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initToggleUI();
        // 若初始状态为 true 但无对话，则重置为 false
        if (isPlaygroundUI && !hasConversation()) {
            isPlaygroundUI = false;
            localStorage.setItem(STORAGE_KEY, false);
            updateToggleButton();
            applyUI();
            alert("请先进行一轮对话。Playground UI 只能从已有的对话切入");
        }
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            initToggleUI();
            if (isPlaygroundUI && !hasConversation()) {
                isPlaygroundUI = false;
                localStorage.setItem(STORAGE_KEY, false);
                updateToggleButton();
                applyUI();
                alert("请先进行一轮对话。Playground UI 只能从已有的对话切入");
            }
        });
    }
})();
