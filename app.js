/**
 * AI Chat to Markdown Converter
 * Gemini・ChatGPTの会話履歴をMarkdownファイルに変換するツール
 */

class AIChatConverter {
    constructor() {
        this.jsonData = null;
        this.conversations = [];
        this.exportType = 'per_chat';
        this.detectedSource = 'AI'; // 'Gemini', 'ChatGPT', or 'AI'

        this.initElements();
        this.initEventListeners();
    }

    initElements() {
        // Drop zone
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');

        // Sections
        this.optionsSection = document.getElementById('optionsSection');
        this.statsSection = document.getElementById('statsSection');
        this.actionSection = document.getElementById('actionSection');
        this.progressSection = document.getElementById('progressSection');
        this.resultSection = document.getElementById('resultSection');

        // Stats
        this.totalConversations = document.getElementById('totalConversations');
        this.totalMessages = document.getElementById('totalMessages');
        this.outputFiles = document.getElementById('outputFiles');

        // Buttons
        this.convertBtn = document.getElementById('convertBtn');
        this.resetBtn = document.getElementById('resetBtn');

        // Progress
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.resultText = document.getElementById('resultText');
    }

    initEventListeners() {
        // Drag and drop
        this.dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.dropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.dropZone.addEventListener('drop', (e) => this.handleDrop(e));
        this.dropZone.addEventListener('click', () => this.fileInput.click());

        // File input
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // Export type
        document.querySelectorAll('input[name="exportType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.exportType = e.target.value;
                this.updateOutputFileCount();
            });
        });

        // Convert button
        this.convertBtn.addEventListener('click', () => this.convert());

        // Reset button
        this.resetBtn.addEventListener('click', () => this.reset());
    }

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    async processFile(file) {
        if (!file.name.endsWith('.json')) {
            this.showError('JSONファイルを選択してください');
            return;
        }

        // ファイル名を保存（ソース検出に使用）
        this.fileName = file.name;

        try {
            const text = await file.text();
            this.jsonData = JSON.parse(text);
            this.parseConversations();
            this.updateUI();
        } catch (error) {
            console.error('Error parsing JSON:', error);
            this.showError('JSONファイルの解析に失敗しました');
        }
    }

    parseConversations() {
        this.conversations = [];
        this.detectedSource = 'AI';

        // ファイル名からソースを事前検出
        this.detectSourceFromFileName();

        // エクスポート形式を検出して解析
        // Gemini マイアクティビティ形式: header に "Gemini" を含む配列
        if (Array.isArray(this.jsonData) && this.jsonData.length > 0 &&
            this.jsonData[0].header && this.jsonData[0].header.includes('Gemini')) {
            this.detectedSource = 'Gemini';
            this.parseGeminiActivityFormat(this.jsonData);
        }
        // ChatGPT形式: 配列の各要素にmappingプロパティがある
        else if (Array.isArray(this.jsonData) && this.jsonData.length > 0 && this.jsonData[0].mapping) {
            this.detectedSource = 'ChatGPT';
            this.parseArrayFormat(this.jsonData);
        }
        // 形式1: 配列形式 (conversations array)
        else if (Array.isArray(this.jsonData)) {
            this.parseArrayFormat(this.jsonData);
        }
        // 形式2: オブジェクト形式 (conversations property)
        else if (this.jsonData.conversations) {
            this.parseArrayFormat(this.jsonData.conversations);
        }
        // 形式3: Google Takeout形式
        else if (this.jsonData.chats || this.jsonData.history) {
            this.detectedSource = 'Gemini';
            this.parseTakeoutFormat(this.jsonData.chats || this.jsonData.history);
        }
        // 形式4: 単一の会話オブジェクト
        else if (this.jsonData.messages || this.jsonData.content) {
            this.parseSingleConversation(this.jsonData);
        }
        // 形式5: Gemini API形式 (contents配列)
        else if (this.jsonData.contents) {
            this.detectedSource = 'Gemini';
            this.parseApiFormat(this.jsonData);
        }
        else {
            // 汎用的な解析を試みる
            this.parseGenericFormat(this.jsonData);
        }

        // ChatGPTの mapping 形式を含む会話があれば ChatGPT と判定
        if (this.detectedSource === 'AI' && this.conversations.some(c => c._isChatGPT)) {
            this.detectedSource = 'ChatGPT';
        }
    }

    /**
     * ファイル名からソースを検出
     */
    detectSourceFromFileName() {
        if (!this.fileName) return;

        const lowerName = this.fileName.toLowerCase();

        // Geminiのファイル名パターン
        const geminiPatterns = [
            'myactivity.json',
            'マイアクティビティ.json',
            'my_activity.json',
            'gemini'
        ];

        // ChatGPTのファイル名パターン
        const chatgptPatterns = [
            'conversations.json',
            'chatgpt'
        ];

        // Geminiファイル名チェック
        if (geminiPatterns.some(pattern => lowerName.includes(pattern.toLowerCase()))) {
            this.detectedSource = 'Gemini';
            return;
        }

        // ChatGPTファイル名チェック
        if (chatgptPatterns.some(pattern => lowerName.includes(pattern.toLowerCase()))) {
            this.detectedSource = 'ChatGPT';
            return;
        }
    }

    parseArrayFormat(conversations) {
        conversations.forEach((conv, index) => {
            // ChatGPT: id がルートレベルにある場合を優先
            // id がない場合は current_node や mapping から取得を試みる
            let conversationId = conv.id || conv.conversation_id || conv.chat_id || conv.uuid;

            // ChatGPTの current_node を使用（参照スクリプトと同様）
            if (!conversationId && conv.current_node) {
                conversationId = conv.current_node;
            }

            // それでもなければ mapping から抽出
            if (!conversationId && conv.mapping) {
                conversationId = this.extractConversationIdFromMapping(conv.mapping);
            }

            const conversation = {
                id: conversationId || `conversation_${index + 1}`,
                title: conv.title || conv.name || `会話 ${index + 1}`,
                createTime: this.parseTimestamp(conv.create_time || conv.created_at || conv.created || conv.timestamp),
                updateTime: this.parseTimestamp(conv.update_time || conv.updated_at || conv.updated || conv.modified),
                messages: []
            };

            // メッセージを解析
            const messages = conv.messages || conv.mapping || conv.content || conv.history || [];

            if (conv.mapping) {
                // ChatGPT形式のマッピング構造（current_nodeを使用してメッセージチェーンを辿る）
                conversation.messages = this.parseMapping(conv.mapping, conv.current_node);
                conversation._isChatGPT = true;
            } else if (Array.isArray(messages)) {
                messages.forEach(msg => {
                    const parsed = this.parseMessage(msg);
                    if (parsed) {
                        conversation.messages.push(parsed);
                    }
                });
            }

            if (conversation.messages.length > 0 || conv.title) {
                this.conversations.push(conversation);
            }
        });
    }

    /**
     * ChatGPTのmapping構造から会話IDを抽出
     * 最初のユーザーメッセージのIDを使用
     */
    extractConversationIdFromMapping(mapping) {
        const nodeIds = Object.keys(mapping);

        // 最初のユーザーメッセージを探す
        for (const nodeId of nodeIds) {
            const node = mapping[nodeId];
            if (node.message &&
                node.message.author &&
                node.message.author.role === 'user' &&
                node.message.content &&
                node.message.content.content_type === 'text') {
                return nodeId;
            }
        }

        // ユーザーメッセージがなければ、client-created-root以外の最初のノードを使用
        for (const nodeId of nodeIds) {
            if (nodeId !== 'client-created-root' && !nodeId.startsWith('client-')) {
                return nodeId;
            }
        }

        return null;
    }

    parseTakeoutFormat(chats) {
        if (!Array.isArray(chats)) return;

        chats.forEach((chat, index) => {
            const conversation = {
                id: chat.id || `chat_${index + 1}`,
                title: chat.title || chat.name || `会話 ${index + 1}`,
                createTime: this.parseTimestamp(chat.createTime || chat.created),
                updateTime: this.parseTimestamp(chat.updateTime || chat.modified),
                messages: []
            };

            const messages = chat.messages || chat.contents || chat.turns || [];
            messages.forEach(msg => {
                const parsed = this.parseMessage(msg);
                if (parsed) {
                    conversation.messages.push(parsed);
                }
            });

            if (conversation.messages.length > 0) {
                this.conversations.push(conversation);
            }
        });
    }

    /**
     * Gemini マイアクティビティ形式をパース
     * 各エントリは個別のメッセージ（ユーザーの質問 + AIの回答がセット）
     */
    parseGeminiActivityFormat(activities) {
        if (!Array.isArray(activities)) return;

        // 各アクティビティを逆順（古い順）に処理し、会話としてグループ化
        const sortedActivities = [...activities].reverse();

        sortedActivities.forEach((activity, index) => {
            // ユーザーのメッセージを抽出
            let userMessage = '';
            if (activity.title && activity.title.startsWith('送信したメッセージ:')) {
                userMessage = activity.title.replace('送信したメッセージ:', '').trim();
            } else if (activity.title) {
                userMessage = activity.title;
            }

            // AI応答を抽出（HTMLからテキストを抽出）
            let aiResponse = '';
            if (activity.safeHtmlItem && activity.safeHtmlItem.length > 0) {
                aiResponse = this.stripHtml(activity.safeHtmlItem[0].html || '');
            }

            // タイムスタンプを抽出
            const timestamp = activity.time ? new Date(activity.time) : null;

            // 会話オブジェクトを作成
            const conversation = {
                id: `gemini_activity_${index + 1}`,
                title: userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : '') || `会話 ${index + 1}`,
                createTime: timestamp,
                updateTime: timestamp,
                messages: []
            };

            // ユーザーメッセージを追加
            if (userMessage) {
                conversation.messages.push({
                    role: 'user',
                    content: userMessage,
                    timestamp: timestamp
                });
            }

            // AI応答を追加
            if (aiResponse.trim()) {
                conversation.messages.push({
                    role: 'assistant',
                    content: aiResponse.trim(),
                    timestamp: timestamp
                });
            }

            if (conversation.messages.length > 0) {
                this.conversations.push(conversation);
            }
        });
    }

    /**
     * HTMLタグを除去してプレーンテキストを抽出
     */
    stripHtml(html) {
        if (!html) return '';
        // 基本的なHTMLタグの除去
        return html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<p[^>]*>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<li[^>]*>/gi, '- ')
            .replace(/<\/li>/gi, '\n')
            .replace(/<h[1-6][^>]*>/gi, '\n### ')
            .replace(/<\/h[1-6]>/gi, '\n')
            .replace(/<hr\s*\/?>/gi, '\n---\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    parseSingleConversation(data) {
        const conversation = {
            id: data.id || 'conversation_1',
            title: data.title || data.name || '会話',
            createTime: this.parseTimestamp(data.create_time || data.created_at),
            updateTime: this.parseTimestamp(data.update_time || data.updated_at),
            messages: []
        };

        const messages = data.messages || data.content || data.history || [];
        messages.forEach(msg => {
            const parsed = this.parseMessage(msg);
            if (parsed) {
                conversation.messages.push(parsed);
            }
        });

        if (conversation.messages.length > 0) {
            this.conversations.push(conversation);
        }
    }

    parseApiFormat(data) {
        // Gemini API形式: { contents: [{ role: "user", parts: [{ text: "..." }] }] }
        const conversation = {
            id: 'api_conversation_1',
            title: '会話',
            createTime: new Date(),
            updateTime: new Date(),
            messages: []
        };

        data.contents.forEach((content, index) => {
            const role = content.role || 'user';
            const parts = content.parts || [];

            parts.forEach(part => {
                if (part.text) {
                    conversation.messages.push({
                        role: role === 'model' ? 'assistant' : role,
                        content: part.text,
                        timestamp: null
                    });
                }
            });
        });

        if (conversation.messages.length > 0) {
            this.conversations.push(conversation);
        }
    }

    parseGenericFormat(data) {
        // 汎用的な解析：オブジェクトのすべてのプロパティを走査
        const findConversations = (obj, path = '') => {
            if (!obj || typeof obj !== 'object') return;

            if (Array.isArray(obj) && obj.length > 0) {
                // 配列が会話のリストかチェック
                const firstItem = obj[0];
                if (firstItem && (firstItem.messages || firstItem.content || firstItem.parts || firstItem.role)) {
                    this.parseArrayFormat(obj);
                    return;
                }
            }

            for (const key of Object.keys(obj)) {
                const value = obj[key];
                if (key.toLowerCase().includes('conversation') ||
                    key.toLowerCase().includes('chat') ||
                    key.toLowerCase().includes('message') ||
                    key.toLowerCase().includes('history')) {
                    if (Array.isArray(value)) {
                        this.parseArrayFormat(value);
                    }
                }
                findConversations(value, `${path}.${key}`);
            }
        };

        findConversations(data);
    }

    parseMapping(mapping, currentNode = null) {
        // ChatGPT形式のマッピング構造を解析
        // 参照スクリプトと同様に current_node から親を辿って線形に再構築
        const messages = [];

        if (currentNode && mapping[currentNode]) {
            // current_node から親を辿る方式
            const chain = [];
            const seen = new Set();
            let current = currentNode;

            while (current && mapping[current] && !seen.has(current)) {
                seen.add(current);
                const node = mapping[current];
                const msg = node.message;

                if (msg) {
                    const author = msg.author?.role;
                    const content = msg.content || {};
                    const parts = content.parts || [];
                    const text = parts.filter(p => typeof p === 'string').join('\n').trim();

                    if ((author === 'user' || author === 'assistant') && text) {
                        chain.push({
                            role: author === 'assistant' ? 'assistant' : 'user',
                            content: text,
                            timestamp: this.parseTimestamp(msg.create_time)
                        });
                    }
                }

                current = node.parent;
            }

            // 親から辿ったので逆順にする
            chain.reverse();
            return chain;
        }

        // current_node がない場合は従来のソート方式
        const nodeIds = Object.keys(mapping);

        // メッセージをソート
        const sortedNodes = nodeIds
            .map(id => ({ id, ...mapping[id] }))
            .filter(node => node.message && node.message.content)
            .sort((a, b) => {
                const timeA = a.message.create_time || 0;
                const timeB = b.message.create_time || 0;
                return timeA - timeB;
            });

        sortedNodes.forEach(node => {
            const msg = node.message;
            if (msg.author && msg.content) {
                const role = msg.author.role || 'user';
                let content = '';

                if (msg.content.parts) {
                    content = msg.content.parts.filter(p => typeof p === 'string').join('\n');
                } else if (typeof msg.content === 'string') {
                    content = msg.content;
                }

                if (content.trim() && role !== 'system') {
                    messages.push({
                        role: role === 'assistant' || role === 'model' ? 'assistant' : role,
                        content: content.trim(),
                        timestamp: this.parseTimestamp(msg.create_time)
                    });
                }
            }
        });

        return messages;
    }

    parseMessage(msg) {
        if (!msg) return null;

        let role = '';
        let content = '';
        let timestamp = null;

        // ロールの取得
        if (msg.role) {
            role = msg.role;
        } else if (msg.author) {
            role = typeof msg.author === 'string' ? msg.author : msg.author.role || 'user';
        } else if (msg.sender) {
            role = msg.sender;
        } else if (msg.from) {
            role = msg.from;
        }

        // ロールの正規化
        role = role.toLowerCase();
        if (role === 'model' || role === 'gemini' || role === 'ai' || role === 'bot') {
            role = 'assistant';
        } else if (role === 'human') {
            role = 'user';
        }

        // コンテンツの取得
        if (msg.content) {
            if (typeof msg.content === 'string') {
                content = msg.content;
            } else if (msg.content.parts) {
                content = msg.content.parts
                    .filter(p => typeof p === 'string' || p.text)
                    .map(p => typeof p === 'string' ? p : p.text)
                    .join('\n');
            } else if (msg.content.text) {
                content = msg.content.text;
            }
        } else if (msg.parts) {
            content = msg.parts
                .filter(p => p.text || typeof p === 'string')
                .map(p => p.text || p)
                .join('\n');
        } else if (msg.text) {
            content = msg.text;
        } else if (msg.message) {
            content = typeof msg.message === 'string' ? msg.message : JSON.stringify(msg.message);
        }

        // タイムスタンプの取得
        timestamp = this.parseTimestamp(
            msg.create_time || msg.created_at || msg.timestamp || msg.time || msg.date
        );

        if (!content.trim()) return null;

        return {
            role: role || 'user',
            content: content.trim(),
            timestamp: timestamp
        };
    }

    parseTimestamp(value) {
        if (!value) return null;

        if (value instanceof Date) return value;

        // Unix timestamp (seconds)
        if (typeof value === 'number') {
            // 10桁ならseconds、13桁ならmilliseconds
            const ts = value > 9999999999 ? value : value * 1000;
            return new Date(ts);
        }

        // ISO文字列
        if (typeof value === 'string') {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return date;
            }
        }

        return null;
    }

    updateUI() {
        const totalMsgs = this.conversations.reduce(
            (sum, conv) => sum + conv.messages.length, 0
        );

        // ソース表示
        const sourceText = this.detectedSource !== 'AI' ? ` (${this.detectedSource})` : '';

        this.dropZone.classList.add('has-file');
        this.dropZone.querySelector('.drop-text').textContent =
            `${this.conversations.length}件の会話を検出しました${sourceText}`;

        this.totalConversations.textContent = this.conversations.length;
        this.totalMessages.textContent = totalMsgs;
        this.updateOutputFileCount();

        this.statsSection.classList.add('visible');
        this.actionSection.classList.add('visible');
        this.convertBtn.disabled = this.conversations.length === 0;
    }

    updateOutputFileCount() {
        let count = 0;

        switch (this.exportType) {
            case 'per_chat':
                count = this.conversations.length;
                break;
            case 'per_month':
                count = this.getUniqueMonths().size;
                break;
            case 'per_year':
                count = this.getUniqueYears().size;
                break;
        }

        this.outputFiles.textContent = count;
    }

    getUniqueMonths() {
        const months = new Set();
        this.conversations.forEach(conv => {
            const date = conv.createTime || conv.updateTime || new Date();
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            months.add(key);
        });
        return months;
    }

    getUniqueYears() {
        const years = new Set();
        this.conversations.forEach(conv => {
            const date = conv.createTime || conv.updateTime || new Date();
            years.add(date.getFullYear().toString());
        });
        return years;
    }

    async convert() {
        this.progressSection.classList.add('visible');
        this.actionSection.classList.remove('visible');

        const files = this.generateMarkdownFiles();

        // 進捗表示
        for (let i = 0; i < 100; i += 10) {
            this.progressFill.style.width = `${i}%`;
            this.progressText.textContent = `変換中... ${i}%`;
            await this.sleep(50);
        }

        // ダウンロード
        if (files.length === 1) {
            this.downloadSingleFile(files[0]);
        } else {
            await this.downloadAsZip(files);
        }

        this.progressFill.style.width = '100%';
        this.progressText.textContent = '完了！';

        await this.sleep(500);

        this.progressSection.classList.remove('visible');
        this.resultSection.classList.add('visible');
        this.resultText.textContent = `${files.length}個のファイルをダウンロードしました。`;
    }

    generateMarkdownFiles() {
        const files = [];
        const prefix = this.detectedSource === 'ChatGPT' ? 'chatgpt' :
            this.detectedSource === 'Gemini' ? 'gemini' : 'ai_chat';

        switch (this.exportType) {
            case 'per_chat':
                this.conversations.forEach((conv, index) => {
                    // より適切なファイル名を生成
                    const filename = this.generateFilename(conv, index, prefix) + '.md';
                    const content = this.conversationToMarkdown(conv);
                    files.push({ filename, content });
                });
                break;

            case 'per_month':
                const byMonth = this.groupByMonth();
                byMonth.forEach((convs, monthKey) => {
                    const filename = `${prefix}_${monthKey}.md`;
                    const content = this.multiConversationsToMarkdown(convs, monthKey);
                    files.push({ filename, content });
                });
                break;

            case 'per_year':
                const byYear = this.groupByYear();
                byYear.forEach((convs, year) => {
                    const filename = `${prefix}_${year}.md`;
                    const content = this.multiConversationsToMarkdown(convs, year);
                    files.push({ filename, content });
                });
                break;
        }

        return files;
    }

    groupByMonth() {
        const groups = new Map();

        this.conversations.forEach(conv => {
            const date = conv.createTime || conv.updateTime || new Date();
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(conv);
        });

        // 日付でソート
        return new Map([...groups.entries()].sort());
    }

    groupByYear() {
        const groups = new Map();

        this.conversations.forEach(conv => {
            const date = conv.createTime || conv.updateTime || new Date();
            const key = date.getFullYear().toString();

            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(conv);
        });

        return new Map([...groups.entries()].sort());
    }

    conversationToMarkdown(conv) {
        let md = '';
        const aiLabel = this.getAILabel();
        const sourcePrefix = this.detectedSource.toLowerCase();

        // YAMLフロントマター
        md += '---\n';
        md += `title: "${(conv.title || '会話').replace(/"/g, '\\"')}"\n`;
        md += `${sourcePrefix}_conversation_id: "${conv.id}"\n`;
        if (conv.createTime) {
            md += `created_utc: ${this.formatISODate(conv.createTime)}\n`;
        }
        if (conv.updateTime) {
            md += `updated_utc: ${this.formatISODate(conv.updateTime)}\n`;
        }
        md += '---\n\n';

        // タイトル
        md += `# ${conv.title || '会話'}\n\n`;

        // メタデータ（日時情報）
        if (conv.createTime) {
            md += `- Created (UTC): ${this.formatISODate(conv.createTime)}\n`;
        }
        if (conv.updateTime) {
            md += `- Updated (UTC): ${this.formatISODate(conv.updateTime)}\n`;
        }
        if (conv.createTime || conv.updateTime) {
            md += '\n';
        }

        md += '---\n\n';

        // メッセージ
        conv.messages.forEach(msg => {
            const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
            md += `## ${roleLabel}\n`;

            // メッセージのタイムスタンプ
            if (msg.timestamp) {
                md += `*Time (UTC): ${this.formatISODate(msg.timestamp)}*\n`;
            }
            md += '\n';
            md += `${msg.content}\n\n`;
        });

        return md;
    }

    /**
     * ISO8601形式で日時をフォーマット
     */
    formatISODate(date) {
        if (!date) return '';
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        return date.toISOString();
    }

    getAILabel() {
        switch (this.detectedSource) {
            case 'ChatGPT':
                return 'ChatGPT';
            case 'Gemini':
                return 'Gemini';
            default:
                return 'AI';
        }
    }

    multiConversationsToMarkdown(conversations, periodKey) {
        const sourceLabel = this.detectedSource !== 'AI' ? this.detectedSource : 'AI Chat';

        let md = `# ${sourceLabel} 会話履歴 - ${periodKey}\n\n`;
        md += `**会話数**: ${conversations.length}\n\n`;
        md += '---\n\n';

        conversations.forEach((conv, index) => {
            md += `## ${index + 1}. ${conv.title || '会話'}\n\n`;

            // ID情報
            if (conv.id && !conv.id.startsWith('conversation_')) {
                const sourcePrefix = this.detectedSource.toLowerCase();
                md += `- ${sourcePrefix}_conversation_id: ${conv.id}\n`;
            }

            // 日時情報
            if (conv.createTime) {
                md += `- Created (UTC): ${this.formatISODate(conv.createTime)}\n`;
            }
            if (conv.updateTime) {
                md += `- Updated (UTC): ${this.formatISODate(conv.updateTime)}\n`;
            }
            if (conv.id || conv.createTime || conv.updateTime) {
                md += '\n';
            }

            conv.messages.forEach(msg => {
                const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
                md += `### ${roleLabel}\n`;

                // メッセージのタイムスタンプ
                if (msg.timestamp) {
                    md += `*Time (UTC): ${this.formatISODate(msg.timestamp)}*\n`;
                }
                md += '\n';
                md += `${msg.content}\n\n`;
            });

            md += '---\n\n';
        });

        return md;
    }

    sanitizeFilename(name) {
        return name
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, '_')
            .substring(0, 100);
    }

    /**
     * 適切なファイル名を生成
     * UUID形式のタイトルの場合は日時ベースやプレフィックス付きの名前にフォールバック
     */
    generateFilename(conv, index, prefix) {
        const title = conv.title;

        // UUIDパターンを検出 (例: 124db277-22cf-49ae-bd3d-00d67e4d6ea5)
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        // タイトルが有効かチェック
        const isValidTitle = title &&
            title.trim() !== '' &&
            !uuidPattern.test(title) &&
            title !== `会話 ${index + 1}`;

        if (isValidTitle) {
            return this.sanitizeFilename(title);
        }

        // 日時ベースのファイル名を生成
        if (conv.createTime) {
            const date = conv.createTime;
            const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
            const timeStr = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
            return `${prefix}_${dateStr}_${timeStr}_${String(index + 1).padStart(3, '0')}`;
        }

        // フォールバック: プレフィックス + 連番
        return `${prefix}_conversation_${String(index + 1).padStart(3, '0')}`;
    }

    formatDate(date) {
        if (!date) return '';
        return date.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    downloadSingleFile(file) {
        const blob = new Blob([file.content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async downloadAsZip(files) {
        const zip = new JSZip();
        const prefix = this.detectedSource === 'ChatGPT' ? 'chatgpt' :
            this.detectedSource === 'Gemini' ? 'gemini' : 'ai_chat';

        files.forEach(file => {
            zip.file(file.filename, file.content);
        });

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${prefix}_conversations.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    reset() {
        this.jsonData = null;
        this.conversations = [];

        this.dropZone.classList.remove('has-file');
        this.dropZone.querySelector('.drop-text').textContent = 'JSONファイルをドラッグ＆ドロップ';

        this.statsSection.classList.remove('visible');
        this.actionSection.classList.remove('visible');
        this.resultSection.classList.remove('visible');

        this.progressFill.style.width = '0%';
        this.fileInput.value = '';
        this.convertBtn.disabled = true;
    }

    showError(message) {
        alert(message);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new AIChatConverter();
});
