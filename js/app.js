const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDulm6VQn7tzAy1Hs08Wgjo_Mw04sfFl8I",
    authDomain: "jaemi-ledger.firebaseapp.com",
    databaseURL: "https://jaemi-ledger-default-rtdb.firebaseio.com",
    projectId: "jaemi-ledger",
    storageBucket: "jaemi-ledger.firebasestorage.app",
    messagingSenderId: "904290874659",
    appId: "1:904290874659:web:d4b8c6354422079b294896"
};

const App = {
    db: null,
    isFirstSync: true,
    state: {
        income: { husband: 0, wife: 0, husbandCat: '급여', wifeCat: '급여' },
        fixedCosts: [],
        transactions: [],
        categories: ['식대', '유류비', '카페/간식', '마트/생필품', '의료/건강', '교통비', '쇼핑', '구독료', '차량수선비', '저축', '기타'],
        incomeCategories: ['급여', '보너스', '부수입', '금융수익', '중고거래', '기타'],
        paymentMethods: { accounts: ['현금'], cards: [] },
        lastFixedCheck: '', // YYYY-MM-DD
        selectedMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
        currentPage: 'dashboard',
        isFixedCostsCollapsed: false,
        fixedIncomes: [],
        isFixedIncomesCollapsed: false,
        minaPassword: '0000',
        isMinaUnlocked: false,
        txTabMode: 'common'
    },

    init() {
        console.log("App initializing...");
        try {
            this.state.selectedMonth = new Date().toISOString().slice(0, 7);
            this.initFirebase();
            this.loadData();
            this.state.currentPage = 'dashboard';
            this.state.isMinaUnlocked = false;
            
            if (typeof this.checkAutomaticTransactions === 'function') {
                this.checkAutomaticTransactions();
            }
            
            this.bindEvents();
            this.render();
            console.log("App initialized successfully.");
        } catch (error) {
            console.error("App Initialization Critical Error:", error);
            alert("앱 초기화 중 오류가 발생했습니다: " + error.message);
        }
    },

    initFirebase() {
        if (typeof firebase === 'undefined') {
            console.warn("Firebase library not loaded. Running in offline mode.");
            return;
        }

        if (FIREBASE_CONFIG.apiKey === "YOUR_API_KEY" || !FIREBASE_CONFIG.apiKey) {
            console.warn("Firebase config is incomplete. Running in local mode.");
            return;
        }
        
        try {
            firebase.initializeApp(FIREBASE_CONFIG);
            this.db = firebase.database();
            
            // Real-time sync from Firebase
            this.db.ref('state').on('value', (snapshot) => {
                const data = snapshot.val();
                
                // Update UI status
                const dot = document.getElementById('sync-dot');
                const text = document.getElementById('sync-text');
                if (dot) dot.style.background = '#10b981';
                if (text) text.textContent = '클라우드 동기화 중';

                if (data) {
                    // Update state but keep some local-only properties if needed
                    const currentPage = this.state.currentPage;
                    const isMinaUnlocked = this.state.isMinaUnlocked;
                    const selectedMonth = this.state.selectedMonth;
                    const txTabMode = this.state.txTabMode;
                    
                    this.state = { ...this.state, ...data };
                    
                    // Restore local-only/session state
                    this.state.currentPage = currentPage;
                    this.state.isMinaUnlocked = isMinaUnlocked;
                    this.state.selectedMonth = selectedMonth;
                    this.state.txTabMode = txTabMode;

                    // Validation: Ensure essential arrays exist
                    if (!Array.isArray(this.state.transactions)) this.state.transactions = [];
                    if (!Array.isArray(this.state.fixedCosts)) this.state.fixedCosts = [];
                    if (!Array.isArray(this.state.fixedIncomes)) this.state.fixedIncomes = [];
                    if (!this.state.selectedMonth) this.state.selectedMonth = new Date().toISOString().slice(0, 7);
                    
                    if (this.isFirstSync) {
                        this.isFirstSync = false;
                        this.checkAutomaticTransactions();
                    }
                    this.render();
                } else if (this.isFirstSync) {
                    // First time? Upload current local storage data to Firebase
                    this.isFirstSync = false;
                    this.saveData();
                }
            });
        } catch (error) {
            console.error("Firebase Initialization Error:", error);
        }
    },

    loadData() {
        const saved = localStorage.getItem('assetflow_data');
        if (saved) {
            const data = JSON.parse(saved);
            
            // Migration: old income object to fixedIncomes array
            if (data.income && (!data.fixedIncomes || data.fixedIncomes.length === 0)) {
                data.fixedIncomes = [];
                if (data.income.husband > 0) {
                    data.fixedIncomes.push({
                        name: '재언 고정수입',
                        amount: data.income.husband,
                        date: 1,
                        category: data.income.husbandCat || '급여',
                        incomeType: 'personal_jaeeon'
                    });
                }
                if (data.income.wife > 0) {
                    data.fixedIncomes.push({
                        name: '미나 고정수입',
                        amount: data.income.wife,
                        date: 1,
                        category: data.income.wifeCat || '급여',
                        incomeType: 'personal_mina'
                    });
                }
                delete data.income; // Cleanup
            }
            
            this.state = { ...this.state, ...data };
            
            // Validation: Ensure essential arrays exist
            if (!Array.isArray(this.state.transactions)) this.state.transactions = [];
            if (!Array.isArray(this.state.fixedCosts)) this.state.fixedCosts = [];
            if (!Array.isArray(this.state.fixedIncomes)) this.state.fixedIncomes = [];
            if (!this.state.selectedMonth) this.state.selectedMonth = new Date().toISOString().slice(0, 7);
        }
    },

    saveData() {
        localStorage.setItem('assetflow_data', JSON.stringify(this.state));
        
        // Sync to Firebase
        if (this.db) {
            const syncData = { ...this.state };
            // Don't sync session-only data
            delete syncData.isMinaUnlocked;
            delete syncData.currentPage; 
            delete syncData.selectedMonth;
            delete syncData.txTabMode; // Keep tab mode local too
            
            this.db.ref('state').set(syncData).catch(err => console.error("Firebase Save Error:", err));
        }
    },

    checkAutomaticTransactions() {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const currentYearMonth = todayStr.slice(0, 7);
        
        if (this.state.lastFixedCheck === todayStr) return;

        let addedCount = 0;

        // 1. Automatic Fixed Income
        this.state.fixedIncomes.forEach(item => {
            const day = parseInt(item.date);
            if (today.getDate() >= day) {
                const alreadyAdded = this.state.transactions.some(t => 
                    t.isAutoIncome && t.fixedIncomeName === item.name && t.date.startsWith(currentYearMonth)
                );
                
                if (!alreadyAdded) {
                    const transactionDate = `${currentYearMonth}-${String(day).padStart(2, '0')}`;
                    this.state.transactions.unshift({
                        id: Date.now() + addedCount++,
                        type: 'income',
                        incomeType: item.incomeType || 'common',
                        date: transactionDate,
                        merchant: `[자동] ${item.name}`,
                        amount: parseInt(item.amount),
                        category: item.category || '급여',
                        isAutoIncome: true,
                        fixedIncomeName: item.name
                    });
                }
            }
        });

        // 2. Automatic Fixed Expenses
        this.state.fixedCosts.forEach(item => {
            const day = parseInt(item.date);
            if (today.getDate() >= day) {
                const alreadyAdded = this.state.transactions.some(t => 
                    t.isAutoFixed && t.fixedCostName === item.name && t.date.startsWith(currentYearMonth)
                );

                if (!alreadyAdded) {
                    const transactionDate = `${currentYearMonth}-${String(day).padStart(2, '0')}`;
                    this.state.transactions.unshift({
                        id: Date.now() + addedCount++,
                        type: 'expense',
                        spendingType: item.spendingType || 'common',
                        date: transactionDate,
                        merchant: `[자동] ${item.name}`,
                        amount: parseInt(item.amount),
                        category: item.category || '기타',
                        paymentMethod: { 
                            type: this.state.paymentMethods.cards.includes(item.source) ? 'card' : 'account', 
                            name: item.source || '자동이체' 
                        },
                        isAutoFixed: true,
                        fixedCostName: item.name
                    });
                }
            }
        });

        if (addedCount > 0) {
            this.state.lastFixedCheck = todayStr;
            this.saveData();
        }
    },

    bindEvents() {
        document.querySelectorAll('nav li').forEach(li => {
            li.addEventListener('click', () => {
                this.state.currentPage = li.dataset.page;
                document.querySelectorAll('nav li').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
                this.render();
            });
        });
    },

    render() {
        const main = document.getElementById('main-content');

        // Update sidebar active state
        document.querySelectorAll('nav li').forEach(li => {
            if (li.dataset.page === this.state.currentPage) {
                li.classList.add('active');
            } else {
                li.classList.remove('active');
            }
        });
        
        // Handle password protection for Mina's Dashboard
        if (this.state.currentPage === 'dashboard-mina' && !this.state.isMinaUnlocked) {
            const template = document.getElementById('tpl-password-prompt');
            main.innerHTML = '';
            main.appendChild(template.content.cloneNode(true));
            this.initPasswordPrompt();
            return;
        }

        const templateId = this.state.currentPage === 'dashboard-mina' ? 'tpl-dashboard' : `tpl-${this.state.currentPage}`;
        const template = document.getElementById(templateId);
        
        if (!template) {
            console.error(`Template not found: ${templateId}`);
            // Fallback to dashboard to prevent white screen
            this.state.currentPage = 'dashboard';
            const fallbackTemplate = document.getElementById('tpl-dashboard');
            if (fallbackTemplate) {
                main.innerHTML = '';
                main.appendChild(fallbackTemplate.content.cloneNode(true));
                this.initDashboard('common');
            }
            return;
        }

        main.innerHTML = '';
        main.appendChild(template.content.cloneNode(true));

        // Page specific initialization
        if (this.state.currentPage === 'dashboard') {
            this.initDashboard('common');
        } else if (this.state.currentPage === 'dashboard-mina') {
            this.initDashboard('mina');
        } else if (this.state.currentPage === 'expenses') {
            this.initExpenses();
        } else if (this.state.currentPage === 'pm-summary') {
            this.initPmSummary();
        } else if (this.state.currentPage === 'settings') {
            this.initSettings();
        }
    },

    initPasswordPrompt() {
        const input = document.getElementById('mina-pass-input');
        const submit = document.getElementById('mina-pass-submit');
        const error = document.getElementById('pass-error');

        const verify = () => {
            if (input.value === this.state.minaPassword) {
                this.state.isMinaUnlocked = true;
                this.render();
            } else {
                error.style.display = 'block';
                input.value = '';
                input.focus();
            }
        };

        submit.onclick = verify;
        input.onkeypress = (e) => { if (e.key === 'Enter') verify(); };
        input.focus();
    },

    // --- Dashboard Logic ---
    initDashboard(mode = 'common') {
        // Update header based on mode
        const headerH1 = document.querySelector('.header-title h1');
        const headerP = document.querySelector('.header-title p');
        if (headerH1) headerH1.textContent = mode === 'common' ? '🏠 공동 대시보드' : '👩‍🎨 미나 개인 대시보드';
        if (headerP) headerP.textContent = mode === 'common' ? '우리 공동의 자산 흐름을 확인하세요.' : '미나님만의 비밀 자산 내역입니다.';

        const monthSelect = document.getElementById('dashboard-month-select');
        monthSelect.value = this.state.selectedMonth;
        monthSelect.onchange = (e) => {
            this.state.selectedMonth = e.target.value;
            this.initDashboard(mode);
        };

        const selectedMonth = this.state.selectedMonth || new Date().toISOString().slice(0, 7);
        const [year, month] = selectedMonth.split('-').map(Number);
        
        // Filter transactions for the selected month and mode
        const filteredTransactions = this.state.transactions.filter(t => {
            // Month filter
            const tDate = new Date(t.date);
            const tYear = tDate.getFullYear();
            const tMonth = tDate.getMonth() + 1; // 1-12
            const isCard = t.paymentMethod && t.paymentMethod.type === 'card';
            
            let isInMonth = false;
            if (isCard) {
                // Timezone-safe month shifting using string manipulation
                const [y, m] = t.date.split('-').map(Number);
                let nextY = y;
                let nextM = m + 1;
                if (nextM > 12) {
                    nextM = 1;
                    nextY++;
                }
                const reflectYearMonth = `${nextY}-${String(nextM).padStart(2, '0')}`;
                isInMonth = reflectYearMonth === this.state.selectedMonth;
            } else {
                isInMonth = t.date.startsWith(this.state.selectedMonth);
            }

            if (!isInMonth) return false;

            // Mode filter
            if (mode === 'common') {
                return (t.type === 'expense' && t.spendingType === 'common') || 
                       (t.type === 'income' && t.incomeType === 'common');
            } else {
                return (t.type === 'expense' && t.spendingType === 'personal_mina') || 
                       (t.type === 'income' && t.incomeType === 'personal_mina');
            }
        });

        // Fixed Income calculation for mode
        const relevantFixedIncomes = this.state.fixedIncomes.filter(item => 
            (mode === 'common' && item.incomeType === 'common') || 
            (mode === 'mina' && item.incomeType === 'personal_mina')
        );
        const totalFixedIncomeBase = relevantFixedIncomes.reduce((sum, item) => sum + parseInt(item.amount), 0);

        const extraIncomeTotal = filteredTransactions
            .filter(t => t.type === 'income')
            .reduce((sum, item) => sum + item.amount, 0);
        
        // Combined income doesn't count [자동] or [고정] because those are already in transactions
        // Wait, the original code had combinedTotalIncome = totalIncome + extraIncomeTotal
        // But in the new system, fixed incomes are automatically added to transactions.
        // So combinedTotalIncome should just be the sum of all 'income' transactions in the filtered set.
        const combinedTotalIncome = extraIncomeTotal;

        const relevantFixedCosts = this.state.fixedCosts.filter(item => 
            (mode === 'common' && item.spendingType === 'common') || 
            (mode === 'mina' && item.spendingType === 'personal_mina')
        );
        const totalFixedExpense = relevantFixedCosts.reduce((sum, item) => sum + parseInt(item.amount), 0);
        const totalFixedExpenseAccountOnly = relevantFixedCosts
            .filter(item => !this.state.paymentMethods.cards.includes(item.source))
            .reduce((sum, item) => sum + parseInt(item.amount), 0);
        
        // --- Split Calculations ---
        const getSum = (arr, type, categoryType, targetType) => arr
            .filter(t => t.type === type && t[categoryType] === targetType)
            .reduce((sum, item) => sum + item.amount, 0);

        // Common
        const commonInc = getSum(filteredTransactions, 'income', 'incomeType', 'common');
        const commonExp = getSum(filteredTransactions, 'expense', 'spendingType', 'common');
        const commonExpPure = filteredTransactions
            .filter(t => t.type === 'expense' && t.spendingType === 'common' && t.category !== '저축')
            .reduce((sum, item) => sum + item.amount, 0);
        const commonRem = commonInc - commonExp;

        // Jaeeon
        const jaeeonInc = getSum(filteredTransactions, 'income', 'incomeType', 'personal_jaeeon');
        const jaeeonExp = getSum(filteredTransactions, 'expense', 'spendingType', 'personal_jaeeon');
        const jaeeonRem = jaeeonInc - jaeeonExp;

        // Mina
        const minaInc = getSum(filteredTransactions, 'income', 'incomeType', 'personal_mina');
        const minaExp = getSum(filteredTransactions, 'expense', 'spendingType', 'personal_mina');
        const minaExpPure = filteredTransactions
            .filter(t => t.type === 'expense' && t.spendingType === 'personal_mina' && t.category !== '저축')
            .reduce((sum, item) => sum + item.amount, 0);
        const minaRem = minaInc - minaExp;

        // Cumulative Savings (Filtered by mode)
        const accumulatedSavings = this.state.transactions
            .filter(t => {
                const isSavings = t.type === 'expense' && t.category === '저축';
                if (!isSavings) return false;
                if (mode === 'common') return t.spendingType === 'common';
                return t.spendingType === 'personal_mina';
            })
            .reduce((sum, item) => sum + item.amount, 0);

        const totalRemaining = mode === 'common' ? commonRem : (mode === 'mina' ? minaRem : 0);
        
        // --- Calculate New Metrics ---
        // 1. Transactions strictly within the selected month (No shifting)
        const actualMonthTxs = this.state.transactions.filter(t => {
            const isMonth = t.date.startsWith(this.state.selectedMonth);
            if (!isMonth) return false;
            if (mode === 'common') {
                return (t.type === 'expense' && t.spendingType === 'common') || (t.type === 'income' && t.incomeType === 'common');
            } else {
                return (t.type === 'expense' && t.spendingType === 'personal_mina') || (t.type === 'income' && t.incomeType === 'personal_mina');
            }
        });

        // 당월 실제 카드/현금 지출 (저축 제외)
        const actualCardExp = actualMonthTxs
            .filter(t => t.type === 'expense' && t.paymentMethod?.type === 'card' && t.category !== '저축')
            .reduce((sum, t) => sum + t.amount, 0);
        
        const actualCashExp = actualMonthTxs
            .filter(t => t.type === 'expense' && t.paymentMethod?.type === 'account' && t.category !== '저축')
            .reduce((sum, t) => sum + t.amount, 0);
            
        const totalActualExp = actualCardExp + actualCashExp;

        // 2. Paid Fixed Expenses in current month
        const paidFixedExp = actualMonthTxs
            .filter(t => t.isAutoFixed && t.type === 'expense' && t.category !== '저축')
            .reduce((sum, t) => sum + t.amount, 0);
        
        const paidFixedCashExp = actualMonthTxs
            .filter(t => t.isAutoFixed && t.type === 'expense' && t.paymentMethod?.type === 'account' && t.category !== '저축')
            .reduce((sum, t) => sum + t.amount, 0);

        // 3. Shifted transactions (Card from prev month)
        const shiftedCardExp = filteredTransactions
            .filter(t => t.type === 'expense' && t.paymentMethod?.type === 'card' && t.category !== '저축')
            .reduce((sum, t) => sum + t.amount, 0);
        
        // 4. Total Monthly Income (Fixed + Extra)
        const extraIncomeReceived = actualMonthTxs
            .filter(t => t.type === 'income' && !t.isAutoIncome)
            .reduce((sum, t) => sum + t.amount, 0);
        const totalIncomeForMonth = totalFixedIncomeBase + extraIncomeReceived;

        const livingExp = (totalActualExp || 0) - (paidFixedExp || 0);

        // 5. Projected Month-end Balance
        const lastDayInMonth = new Date(year, month, 0).getDate() || 30;
        const daysElapsedInMonth = (new Date().getFullYear() === year && new Date().getMonth() === month - 1) ? new Date().getDate() : lastDayInMonth;
        const safeDaysElapsed = daysElapsedInMonth || 1;
        const dailyLivingExpAvg = livingExp / safeDaysElapsed;
        const projectedLivingExpTotal = Math.round(dailyLivingExpAvg * lastDayInMonth);
        
        // Month-end Projection = Total Income - Prev Month Card Bill - Projected Living Exp - Scheduled Account Fixed Expenses
        const projectedBalance = (totalIncomeForMonth || 0) - ((shiftedCardExp || 0) + (projectedLivingExpTotal || 0) + (totalFixedExpenseAccountOnly || 0));

        // 6. Update DOM
        const setVal = (id, val, color) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = `₩${Math.round(val).toLocaleString()}`;
                if (color) el.style.color = color;
                else el.style.color = ''; // Reset
            }
        };

        const labelPrefix = mode === 'common' ? '' : '미나 ';

        const safeSetText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        safeSetText('stat-total-exp-label', `${labelPrefix}당월지출누계`);
        setVal('stat-total-exp-value', totalActualExp);

        safeSetText('stat-card-exp-label', `${labelPrefix}당월카드지출누계`);
        setVal('stat-card-exp-value', actualCardExp);

        safeSetText('stat-cash-exp-label', `${labelPrefix}당월현금지출누계`);
        setVal('stat-cash-exp-value', actualCashExp);

        safeSetText('stat-prev-card-exp-label', `${labelPrefix}전월카드지출누계`);
        setVal('stat-prev-card-exp-value', shiftedCardExp);

        safeSetText('stat-balance-label', `월말예상잔액`);
        setVal('stat-balance-value', projectedBalance, projectedBalance < 0 ? 'var(--danger)' : 'var(--primary-accent)');
        
        safeSetText('stat-living-exp-label', `${labelPrefix}생활비사용액`);
        setVal('stat-living-exp-value', livingExp);

        // Date labels
        const todayStr = new Date().toISOString().split('T')[0];
        safeSetText('savings-date-label', `(${todayStr} 기준)`);
        safeSetText('emergency-date-label', `(${todayStr} 기준)`);

        // footer stats
        const summarySavingsEl = document.getElementById('stat-accumulated-savings');
        if (summarySavingsEl) summarySavingsEl.textContent = `₩${accumulatedSavings.toLocaleString()}`;
        
        // Emergency Balance (Only for common)
        const colEmergency = document.getElementById('col-emergency-balance');
        if (colEmergency) {
            colEmergency.style.display = mode === 'common' ? 'block' : 'none';
            const emergencyBalance = this.calculateEmergencyBalance();
            const emergencyBalanceEl = document.getElementById('stat-emergency-balance');
            if (emergencyBalanceEl) emergencyBalanceEl.textContent = `₩${emergencyBalance.toLocaleString()}`;
        }
        
        const colLiving = document.getElementById('col-living-balance');
        if (colLiving) colLiving.style.display = mode === 'common' ? 'block' : 'none';
        
        const livingBalanceEl = document.getElementById('stat-living-balance');
        if (livingBalanceEl) {
             // New Formula: Fixed Income - Prev Card Bill - All Cash Exp - (Total Fixed Expense - Paid Fixed Cash Exp)
             const livingBalance = totalFixedIncomeBase - shiftedCardExp - actualCashExp - (totalFixedExpense - paidFixedCashExp);
             livingBalanceEl.textContent = `₩${livingBalance.toLocaleString()}`;
             livingBalanceEl.style.color = livingBalance < 0 ? 'var(--danger)' : 'var(--primary-accent)';
        }

        // Prepare data for advanced forecasting
        const variableExp = filteredTransactions
            .filter(t => t.type === 'expense' && !t.isAutoFixed && !t.fixedCostName)
            .reduce((sum, item) => sum + item.amount, 0);
        
        const variableInc = filteredTransactions
            .filter(t => t.type === 'income' && !t.isAutoIncome && !t.fixedIncomeName)
            .reduce((sum, item) => sum + item.amount, 0);

        const totalFixedExp = relevantFixedCosts.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const totalFixedInc = relevantFixedIncomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

        this.updateForecast(mode, {
            livingExp,
            totalFixedExp,
            totalFixedInc
        }, year, month - 1);
        this.renderChart(actualMonthTxs);
        this.renderFixedTimeline(mode);
    },

    updateForecast(mode, data, targetYear, targetMonth) {
        const now = new Date();
        const isCurrentMonth = now.getFullYear() === targetYear && now.getMonth() === targetMonth;
        
        const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
        const daysElapsed = isCurrentMonth ? now.getDate() : lastDay;
        
        const todayDateEl = document.getElementById('today-date');
        if (todayDateEl) todayDateEl.textContent = isCurrentMonth ? `${targetYear}년 ${targetMonth + 1}월 ${daysElapsed}일` : `${targetYear}년 ${targetMonth + 1}월 (마감됨)`;
        
        const monthProgressEl = document.getElementById('month-progress');
        if (monthProgressEl) monthProgressEl.textContent = Math.round((daysElapsed / lastDay) * 100);

        const forecastContainer = document.querySelector('.forecast-card > div');
        const title = mode === 'common' ? '🏠 공동 생활비 예측' : '👩‍🎨 미나 개인 예측';
        const projectedId = mode === 'common' ? 'projected-common' : 'projected-mina';
        const insightId = mode === 'common' ? 'insight-common' : 'insight-mina';

        if (forecastContainer) {
            forecastContainer.innerHTML = `
                <div style="grid-column: span 3;">
                    <div style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 0.5rem;">${title}</div>
                    <div class="stat-value forecast-value" id="${projectedId}" style="font-size: 1.5rem;">₩0</div>
                    <div id="${insightId}" style="font-size: 0.85rem; margin-top: 0.5rem; line-height: 1.4;"></div>
                </div>
            `;
        }

        this.processPotForecast(mode, data, daysElapsed, lastDay, isCurrentMonth);
    },

    processPotForecast(mode, data, daysElapsed, lastDay, isCurrentMonth) {
        // Simple linear forecast based on Living Expenses
        const dailyLivingExp = data.livingExp / daysElapsed;
        const projectedLivingExp = Math.round(dailyLivingExp * lastDay);
        
        const key = mode === 'common' ? 'common' : 'mina';
        const valEl = document.getElementById(`projected-${key}`);
        if (valEl) valEl.textContent = `₩${projectedLivingExp.toLocaleString()}`;
        
        const insightEl = document.getElementById(`insight-${key}`);
        if (!insightEl) return;

        if (isCurrentMonth) {
            const daysRemaining = lastDay - daysElapsed;
            const projectedRemaining = Math.round(dailyLivingExp * daysRemaining);
            
            insightEl.innerHTML = `
                현재 하루 평균: ₩${Math.round(dailyLivingExp).toLocaleString()}<br>
                월말 예상 생활비: ₩${projectedLivingExp.toLocaleString()}<br>
                <span style="color:var(--primary-accent);">남은 기간 예상 지출: ₩${projectedRemaining.toLocaleString()}</span>
            `;
        } else {
            insightEl.innerHTML = `최종 생활비 지출: ₩${data.livingExp.toLocaleString()}`;
        }
    },

    renderFixedTimeline(mode = 'common') {
        const timeline = document.getElementById('fixed-timeline');
        if (!timeline) return;

        timeline.innerHTML = '';
        const sorted = [...this.state.fixedCosts]
            .filter(item => (mode === 'common' && item.spendingType === 'common') || (mode === 'mina' && item.spendingType === 'personal_mina'))
            .sort((a, b) => parseInt(a.date) - parseInt(b.date));
        
        if (sorted.length === 0) {
            timeline.innerHTML = '<p style="color:var(--text-dim); padding:1rem;">등록된 고정비가 없습니다.</p>';
            return;
        }

        // Add Total Summary at the top
        const totalAmount = sorted.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const summaryDiv = document.createElement('div');
        summaryDiv.style.padding = '0.8rem 1rem';
        summaryDiv.style.background = 'rgba(139, 92, 246, 0.05)';
        summaryDiv.style.borderBottom = '1px solid var(--glass-border)';
        summaryDiv.style.fontWeight = '700';
        summaryDiv.style.color = 'var(--primary-accent)';
        summaryDiv.style.textAlign = 'right';
        summaryDiv.style.fontSize = '0.9rem';
        summaryDiv.textContent = `고정비 합계: ₩${totalAmount.toLocaleString()}`;
        timeline.appendChild(summaryDiv);

        sorted.forEach(item => {
            const div = document.createElement('div');
            div.className = 'timeline-item';
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.padding = '1rem';
            div.style.borderBottom = '1px solid var(--glass-border)';
            div.innerHTML = `
                <div style="width: 40px; height: 40px; background: rgba(139, 92, 246, 0.1); border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-right: 1rem; font-weight: bold; color: var(--primary-accent);">
                    ${item.date}
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 600;">${item.name}</div>
                    <div style="font-size: 0.8rem; color: var(--text-dim);">${item.source} (${item.payer})</div>
                </div>
                <div style="font-weight: 700;">₩${parseInt(item.amount).toLocaleString()}</div>
            `;
            timeline.appendChild(div);
        });
    },

    renderChart(transactions) {
        const canvas = document.getElementById('mainChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const categoryMap = {};
        
        transactions
            .filter(t => t.type === 'expense' && t.category !== '저축')
            .forEach(t => {
                categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
            });

        const labels = Object.keys(categoryMap);
        const data = Object.values(categoryMap);

        if (window.myChart) window.myChart.destroy();
        
        window.myChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#37352f', '#73726e', '#e1e1e1', '#f1f1f1', '#d4402e', 
                        '#0b6e4f', '#dfab01', '#5a5d56', '#a2a2a2'
                    ],
                    hoverBackgroundColor: '#000000',
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { 
                            color: '#37352f', 
                            padding: 20,
                            font: { family: 'Inter', size: 12 } 
                        }
                    }
                },
                cutout: '70%'
            }
        });
    },

    // --- Expenses Logic ---
    initExpenses() {
        const manualCatSelect = document.getElementById('manual-category');
        const incomeCatSelect = document.getElementById('income-category');
        const paymentSelect = document.getElementById('manual-payment-method');
        const expenseMonthSelect = document.getElementById('expense-month-select');

        // Populate selects from state
        manualCatSelect.innerHTML = this.state.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        incomeCatSelect.innerHTML = this.state.incomeCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        
        const accounts = (this.state.paymentMethods.accounts || []).map(name => `<option value="account|${name}">🏦 ${name}</option>`).join('');
        const cards = (this.state.paymentMethods.cards || []).map(name => `<option value="card|${name}">💳 ${name}</option>`).join('');
        
        // Add virtual Emergency Fund account to payment methods if not already there
        const emergencyOption = `<option value="account|비상금통장">🛡️ 비상금통장</option>`;
        
        paymentSelect.innerHTML = (accounts + cards + emergencyOption) || '<option value="">결제 수단 없음</option>';

        // Manual Expense Entry
        document.getElementById('add-manual-expense').onclick = () => {
            const date = document.getElementById('manual-date').value;
            const merchant = document.getElementById('manual-merchant').value;
            const amount = parseInt(document.getElementById('manual-amount').value);
            const category = document.getElementById('manual-category').value;
            const spendingType = document.getElementById('manual-type').value;
            const paymentEl = document.getElementById('manual-payment-method');
            
            if (!paymentEl.value) {
                alert('결제 수단을 먼저 등록해주세요 (설정 메뉴)');
                return;
            }

            const [pmType, pmName] = paymentEl.value.split('|');

            if (date && merchant && amount && pmType) {
                this.state.transactions.unshift({
                    id: Date.now(),
                    type: 'expense',
                    spendingType,
                    date,
                    merchant,
                    amount,
                    category,
                    paymentMethod: { type: pmType, name: pmName }
                });
                this.saveData();
                this.renderTransactionTable();
                ['manual-merchant', 'manual-amount'].forEach(id => document.getElementById(id).value = '');
                if (this.state.currentPage === 'dashboard') this.initDashboard();
            } else {
                alert('지출 정보를 모두 입력해주세요.');
            }
        };

        // Manual Income Entry
        document.getElementById('add-manual-income').onclick = () => {
            const date = document.getElementById('income-date').value;
            const source = document.getElementById('income-source').value;
            const amountVal = document.getElementById('income-amount').value;
            const amount = parseInt(amountVal);
            const category = document.getElementById('income-category').value;
            const incomeType = document.getElementById('income-type').value;

            if (date && source && !isNaN(amount)) {
                this.state.transactions.unshift({
                    id: Date.now(),
                    type: 'income',
                    incomeType,
                    date,
                    merchant: source,
                    amount,
                    category
                });
                this.saveData();
                this.renderTransactionTable();
                ['income-source', 'income-amount'].forEach(id => document.getElementById(id).value = '');
                if (this.state.currentPage === 'dashboard') this.initDashboard();
            } else {
                alert('수입 정보를 모두 입력해주세요.');
            }
        };

        expenseMonthSelect.value = this.state.selectedMonth;
        expenseMonthSelect.onchange = (e) => {
            this.state.selectedMonth = e.target.value;
            this.renderTransactionTable();
        };

        const allTab = document.getElementById('tab-all-tx');
        const commonTab = document.getElementById('tab-common-tx');
        const personalTab = document.getElementById('tab-personal-tx');
        const lockMsg = document.getElementById('personal-tx-lock-msg');
        const txCard = document.getElementById('tx-table-card');

        const setTab = (mode) => {
            this.state.txTabMode = mode;
            [allTab, commonTab, personalTab].forEach(t => {
                if (t) {
                    t.style.color = 'var(--text-dim)';
                    t.style.borderBottom = 'none';
                }
            });

            if (mode === 'all') {
                allTab.style.color = 'var(--primary-accent)';
                allTab.style.borderBottom = '2px solid var(--primary-accent)';
                lockMsg.style.display = 'none';
                txCard.style.display = 'block';
            } else if (mode === 'common') {
                commonTab.style.color = 'var(--primary-accent)';
                commonTab.style.borderBottom = '2px solid var(--primary-accent)';
                lockMsg.style.display = 'none';
                txCard.style.display = 'block';
            } else {
                personalTab.style.color = 'var(--primary-accent)';
                personalTab.style.borderBottom = '2px solid var(--primary-accent)';
                
                if (this.state.isMinaUnlocked) {
                    lockMsg.style.display = 'none';
                    txCard.style.display = 'block';
                } else {
                    lockMsg.style.display = 'block';
                    txCard.style.display = 'none';
                }
            }
            this.renderTransactionTable();
        };

        if (allTab) allTab.onclick = () => setTab('all');
        if (commonTab) commonTab.onclick = () => setTab('common');
        if (personalTab) personalTab.onclick = () => setTab('personal');
        
        const unlockBtn = document.getElementById('unlock-personal-tx');
        if (unlockBtn) {
            unlockBtn.onclick = () => {
                const pass = prompt('미나 개인 내역 비밀번호를 입력하세요:');
                if (pass === this.state.minaPassword) {
                    this.state.isMinaUnlocked = true;
                    setTab('personal');
                } else if (pass !== null) {
                    alert('비밀번호가 올바르지 않습니다.');
                }
            };
        }

        // Initialize view based on current tab mode
        setTab(this.state.txTabMode || 'common');
    },

    // handleFileUpload removed as per user request

    renderTransactionTable() {
        const container = document.getElementById('transaction-list-container');
        const tbody = document.getElementById('transaction-table-body');
        if (!container || !tbody) return; // Not on expenses page
        
        container.style.display = 'block';
        tbody.innerHTML = '';

        const categories = this.state.categories;
        const incomeCategories = this.state.incomeCategories;

        // Filter transactions for the selected month and tab mode
        const filtered = this.state.transactions.filter(t => {
            const isInMonth = t.date.startsWith(this.state.selectedMonth);
            if (!isInMonth) return false;

            if (this.state.txTabMode === 'all') {
                return true;
            } else if (this.state.txTabMode === 'common') {
                return (t.spendingType === 'common') || (t.incomeType === 'common');
            } else {
                // Personal tab: show both jaeeon and mina personal
                return (t.spendingType === 'personal_jaeeon' || t.spendingType === 'personal_mina') || 
                       (t.incomeType === 'personal_jaeeon' || t.incomeType === 'personal_mina');
            }
        });

        filtered.forEach(t => {
            const row = document.createElement('tr');
            const isIncome = t.type === 'income';
            row.style.borderBottom = '1px solid #f1f1f1';
            if (isIncome) row.style.background = 'rgba(11, 110, 79, 0.03)';
            
            const catList = isIncome ? incomeCategories : categories;
            const catOptions = catList.map(cat => `<option value="${cat}" ${cat === t.category ? 'selected' : ''}>${cat}</option>`).join('');

            const typeOptions = `
                <option value="common" ${t.spendingType === 'common' ? 'selected' : ''}>공동</option>
                <option value="personal_jaeeon" ${t.spendingType === 'personal_jaeeon' ? 'selected' : ''}>재언</option>
                <option value="personal_mina" ${t.spendingType === 'personal_mina' ? 'selected' : ''}>미나</option>
            `;

            const pmLabel = t.paymentMethod ? (t.paymentMethod.type === 'account' ? '🏦 ' : '💳 ') + t.paymentMethod.name : '-';

            row.innerHTML = `
                <td style="padding: 1rem; color: var(--text-dim);">
                    <div contenteditable="true" onblur="App.updateTransactionField(${t.id}, 'date', this.innerText)" onkeypress="if(event.keyCode==13){this.blur(); return false;}">${t.date}</div>
                </td>
                <td style="padding: 1rem; font-weight: ${isIncome ? '600' : '400'};">
                    <div contenteditable="true" onblur="App.updateTransactionField(${t.id}, 'merchant', this.innerText)" onkeypress="if(event.keyCode==13){this.blur(); return false;}">${t.merchant}</div>
                </td>
                <td style="padding: 1rem; font-weight: 700; color: ${isIncome ? 'var(--success)' : 'var(--text-main)'};">
                    ₩<span contenteditable="true" onblur="App.updateTransactionField(${t.id}, 'amount', this.innerText)" onkeypress="if(event.keyCode==13){this.blur(); return false;}">${t.amount.toLocaleString()}</span>
                </td>
                <td style="padding: 1rem; color: var(--text-dim); font-size: 0.85rem;">${pmLabel}</td>
                <td style="padding: 1rem; display: flex; gap: 5px; align-items: center;">
                    <select onchange="${isIncome ? 'App.updateIncomeType' : 'App.updateSpendingType'}(${t.id}, this.value)" style="background: rgba(55, 53, 47, 0.05); border: none; padding: 4px 6px; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">
                        ${isIncome ? `
                            <option value="personal_jaeeon" ${t.incomeType === 'personal_jaeeon' ? 'selected' : ''}>재언</option>
                            <option value="personal_mina" ${t.incomeType === 'personal_mina' ? 'selected' : ''}>미나</option>
                            <option value="common" ${t.incomeType === 'common' ? 'selected' : ''}>공동</option>
                        ` : `
                            <option value="common" ${t.spendingType === 'common' ? 'selected' : ''}>공동</option>
                            <option value="personal_jaeeon" ${t.spendingType === 'personal_jaeeon' ? 'selected' : ''}>재언</option>
                            <option value="personal_mina" ${t.spendingType === 'personal_mina' ? 'selected' : ''}>미나</option>
                        `}
                    </select>
                    <select onchange="App.updateTransactionCategory(${t.id}, this.value)" style="background: ${isIncome ? 'rgba(11, 110, 79, 0.08)' : 'rgba(55, 53, 47, 0.05)'}; color: ${isIncome ? 'var(--success)' : 'var(--text-main)'}; border: none; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; cursor: pointer; outline: none;">
                        ${catOptions}
                    </select>
                    <button onclick="App.deleteTransaction(${t.id})" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 1rem; margin-left: 5px; opacity: 0.6; transition: opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">✕</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    },

    updateTransactionField(id, field, value) {
        const idx = this.state.transactions.findIndex(t => t.id === id);
        if (idx !== -1) {
            let finalValue = value.trim();
            if (field === 'amount') {
                finalValue = parseInt(finalValue.replace(/[^0-9]/g, '')) || 0;
            }
            this.state.transactions[idx][field] = finalValue;
            this.saveData();
            
            // Refresh currently visible view
            if (this.state.currentPage === 'expenses') this.renderTransactionTable();
            else if (this.state.currentPage === 'pm-summary') this.initPmSummary();
            else if (this.state.currentPage === 'dashboard') this.initDashboard('common');
            else if (this.state.currentPage === 'dashboard-mina') this.initDashboard('mina');
        }
    },

    updateSpendingType(id, newType) {
        const idx = this.state.transactions.findIndex(t => t.id === id);
        if (idx !== -1) {
            this.state.transactions[idx].spendingType = newType;
            this.saveData();
            // If on dashboard, update stats
            if (this.state.currentPage === 'dashboard') this.initDashboard();
        }
    },

    updateIncomeType(id, newType) {
        const idx = this.state.transactions.findIndex(t => t.id === id);
        if (idx !== -1) {
            this.state.transactions[idx].incomeType = newType;
            this.saveData();
            if (this.state.currentPage === 'dashboard') this.initDashboard();
        }
    },

    updateTransactionCategory(id, newCategory) {
        const idx = this.state.transactions.findIndex(t => t.id === id);
        if (idx !== -1) {
            this.state.transactions[idx].category = newCategory;
            this.saveData();
        }
    },

    deleteTransaction(id) {
        if (confirm('이 내역을 삭제하시겠습니까?')) {
            this.state.transactions = this.state.transactions.filter(t => t.id !== id);
            this.saveData();
            
            // Refresh currently visible view
            if (this.state.currentPage === 'expenses') this.renderTransactionTable();
            else if (this.state.currentPage === 'pm-summary') this.initPmSummary();
            else if (this.state.currentPage === 'dashboard') this.initDashboard('common');
            else if (this.state.currentPage === 'dashboard-mina') this.initDashboard('mina');
        }
    },

    clearTransactions() {
        if (confirm('모든 지출 내역을 삭제하시겠습니까?')) {
            this.state.transactions = [];
            this.saveData();
            this.renderTransactionTable();
            if (this.state.currentPage === 'dashboard') this.initDashboard();
        }
    },

    // --- Settings Logic ---
    initSettings() {
        const fixIncCat = document.getElementById('fixed-inc-category');
        const fixCat = document.getElementById('fixed-category');

        if (fixIncCat) fixIncCat.innerHTML = this.state.incomeCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        if (fixCat) fixCat.innerHTML = this.state.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');

        const updateTotals = () => {
            const incTotal = (this.state.fixedIncomes || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
            const costTotal = (this.state.fixedCosts || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
            
            const incTotalEl = document.getElementById('fixed-income-total-label');
            const costTotalEl = document.getElementById('fixed-cost-total-label');
            
            if (incTotalEl) incTotalEl.textContent = `(합계: ₩${incTotal.toLocaleString()})`;
            if (costTotalEl) costTotalEl.textContent = `(합계: ₩${costTotal.toLocaleString()})`;
        };

        const renderSourceDropdown = () => {
            const fixSource = document.getElementById('fixed-source');
            if (!fixSource) return;
            
            let options = '';
            options += '<optgroup label="💳 카드">';
            options += (this.state.paymentMethods.cards || []).map(c => `<option value="${c}">${c}</option>`).join('');
            options += '</optgroup>';
            options += '<optgroup label="🏦 통장">';
            options += (this.state.paymentMethods.accounts || []).map(a => `<option value="${a}">${a}</option>`).join('');
            options += '</optgroup>';
            
            fixSource.innerHTML = options;
        };

        const renderFixedIncomes = () => {
            const list = document.getElementById('fixed-incomes-list');
            const chevron = document.getElementById('fixed-income-list-chevron');
            
            if (this.state.isFixedIncomesCollapsed) {
                list.style.display = 'none';
                if (chevron) chevron.style.transform = 'rotate(-90deg)';
            } else {
                list.style.display = 'block';
                if (chevron) chevron.style.transform = 'rotate(0deg)';
            }

            list.innerHTML = '';
            const sortedIncomes = [...this.state.fixedIncomes].sort((a, b) => parseInt(a.date) - parseInt(b.date));

            sortedIncomes.forEach((item) => {
                const originalIndex = this.state.fixedIncomes.indexOf(item);
                const div = document.createElement('div');
                div.style.display = 'flex';
                div.style.justifyContent = 'space-between';
                div.style.padding = '0.8rem';
                div.style.background = 'rgba(11, 110, 79, 0.03)';
                div.style.borderRadius = '8px';
                div.style.marginBottom = '0.5rem';
                const typeLabel = item.incomeType === 'common' ? '공동' : (item.incomeType === 'personal_jaeeon' ? '재언' : '미나');
                div.innerHTML = `
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: var(--success);">${item.name} <span style="font-size: 0.75rem; color: var(--text-dim);">[${item.date}일 / ${typeLabel} / ${item.category || '급여'}]</span></div>
                        <div style="font-size: 0.8rem; color: var(--text-dim);">월 정기 수입</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <button class="btn btn-secondary" style="font-size: 0.65rem; padding: 4px 6px; background: rgba(11, 110, 79, 0.08); color: var(--success); border: none;" onclick="App.processFixedIncome(${originalIndex})">수입처리</button>
                        <div style="font-weight: 600; color: var(--success);">₩${parseInt(item.amount).toLocaleString()}</div>
                        <button style="background:none; border:none; color:var(--danger); cursor:pointer;" onclick="App.deleteFixedIncome(${originalIndex})">✕</button>
                    </div>
                `;
                list.appendChild(div);
            });
        };

        const renderFixed = () => {
        const list = document.getElementById('fixed-costs-list');
        const chevron = document.getElementById('fixed-list-chevron');
        
        if (this.state.isFixedCostsCollapsed) {
            list.style.display = 'none';
            if (chevron) chevron.style.transform = 'rotate(-90deg)';
        } else {
            list.style.display = 'block';
            if (chevron) chevron.style.transform = 'rotate(0deg)';
        }

        list.innerHTML = '';
        
        // Sorting is already handled in addFixed/initial load if we want, 
        // but let's ensure it's sorted here for rendering consistency
        const sortedCosts = [...this.state.fixedCosts].sort((a, b) => parseInt(a.date) - parseInt(b.date));

        sortedCosts.forEach((item, index) => {
            const originalIndex = this.state.fixedCosts.indexOf(item);
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.padding = '0.8rem';
            div.style.background = 'rgba(255,255,255,0.03)';
            div.style.borderRadius = '8px';
            div.style.marginBottom = '0.5rem';
            const typeLabel = item.spendingType === 'common' ? '공동' : (item.spendingType === 'personal_jaeeon' ? '재언' : '미나');
            div.innerHTML = `
                    <div style="flex: 1;">
                        <div style="font-weight: 600;">${item.name} <span style="font-size: 0.75rem; color: var(--text-dim);">[${item.date}일 / ${typeLabel} / ${item.category || '미지정'}]</span></div>
                        <div style="font-size: 0.8rem; color: var(--text-dim);">${item.source}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <button class="btn btn-secondary" style="font-size: 0.65rem; padding: 4px 6px; background: rgba(139, 92, 246, 0.1); color: var(--primary-accent); border: none;" onclick="App.processFixed(${originalIndex})">지출처리</button>
                        <div style="font-weight: 600;">₩${parseInt(item.amount).toLocaleString()}</div>
                        <button style="background:none; border:none; color:var(--danger); cursor:pointer;" onclick="App.deleteFixed(${originalIndex})">✕</button>
                    </div>
                `;
            list.appendChild(div);
        });
    };

        const renderCategories = () => {
            const expList = document.getElementById('expense-categories-list');
            const incList = document.getElementById('income-categories-list');
            const accList = document.getElementById('accounts-list');
            const cardList = document.getElementById('cards-list');
            
            expList.innerHTML = this.state.categories.map((cat, i) => `
                <span style="background:#f1f1f1; padding:4px 10px; border-radius:4px; font-size:0.85rem; display:flex; align-items:center; gap:5px;">
                    ${cat} <span style="color:var(--danger); cursor:pointer;" onclick="App.deleteCategory('expense', ${i})">✕</span>
                </span>
            `).join('');
            
            incList.innerHTML = this.state.incomeCategories.map((cat, i) => `
                <span style="background:rgba(11, 110, 79, 0.08); color:var(--success); padding:4px 10px; border-radius:4px; font-size:0.85rem; display:flex; align-items:center; gap:5px;">
                    ${cat} <span style="color:var(--danger); cursor:pointer;" onclick="App.deleteCategory('income', ${i})">✕</span>
                </span>
            `).join('');

            accList.innerHTML = (this.state.paymentMethods.accounts || []).map((name, i) => `
                <span style="background:rgba(139, 92, 246, 0.1); color:var(--primary-accent); padding:4px 10px; border-radius:4px; font-size:0.85rem; display:flex; align-items:center; gap:5px;">
                    ${name} <span style="color:var(--danger); cursor:pointer;" onclick="App.deletePaymentMethod('accounts', ${i})">✕</span>
                </span>
            `).join('');

            cardList.innerHTML = (this.state.paymentMethods.cards || []).map((name, i) => `
                <span style="background:rgba(55, 53, 47, 0.08); padding:4px 10px; border-radius:4px; font-size:0.85rem; display:flex; align-items:center; gap:5px;">
                    ${name} <span style="color:var(--danger); cursor:pointer;" onclick="App.deletePaymentMethod('cards', ${i})">✕</span>
                </span>
            `).join('');
        };

        const addAccount = () => {
            const val = document.getElementById('new-account').value.trim();
            if (val && !this.state.paymentMethods.accounts.includes(val)) {
                this.state.paymentMethods.accounts.push(val);
                this.saveData();
                renderCategories();
                renderSourceDropdown();
                document.getElementById('new-account').value = '';
            }
        };
        document.getElementById('add-account').onclick = addAccount;
        document.getElementById('new-account').onkeypress = (e) => { if (e.key === 'Enter') addAccount(); };

        const addCard = () => {
            const val = document.getElementById('new-card').value.trim();
            if (val && !this.state.paymentMethods.cards.includes(val)) {
                this.state.paymentMethods.cards.push(val);
                this.saveData();
                renderCategories();
                renderSourceDropdown();
                document.getElementById('new-card').value = '';
            }
        };
        document.getElementById('add-card').onclick = addCard;
        document.getElementById('new-card').onkeypress = (e) => { if (e.key === 'Enter') addCard(); };

        const addExpenseCat = () => {
            const val = document.getElementById('new-expense-category').value.trim();
            if (val && !this.state.categories.includes(val)) {
                this.state.categories.push(val);
                this.saveData();
                renderCategories();
                document.getElementById('new-expense-category').value = '';
            }
        };
        document.getElementById('add-expense-category').onclick = addExpenseCat;
        document.getElementById('new-expense-category').onkeypress = (e) => { if (e.key === 'Enter') addExpenseCat(); };

        const addIncomeCat = () => {
            const val = document.getElementById('new-income-category').value.trim();
            if (val && !this.state.incomeCategories.includes(val)) {
                this.state.incomeCategories.push(val);
                this.saveData();
                renderCategories();
                document.getElementById('new-income-category').value = '';
            }
        };
        document.getElementById('add-income-category').onclick = addIncomeCat;
        document.getElementById('new-income-category').onkeypress = (e) => { if (e.key === 'Enter') addIncomeCat(); };

        document.getElementById('add-fixed').onclick = () => {
            const name = document.getElementById('fixed-name').value;
            const amount = document.getElementById('fixed-amount').value;
            const spendingType = document.getElementById('fixed-type').value;
            const date = document.getElementById('fixed-date').value;
            const source = document.getElementById('fixed-source').value;
            const category = document.getElementById('fixed-category').value;

            if (name && amount && date) {
                this.state.fixedCosts.push({ name, amount, spendingType, date, source, category });
                this.state.fixedCosts.sort((a, b) => parseInt(a.date) - parseInt(b.date));
                this.saveData();
                renderFixed();
                ['fixed-name', 'fixed-amount', 'fixed-date', 'fixed-source'].forEach(id => document.getElementById(id).value = '');
            } else {
                alert('항목명, 금액, 출금일은 필수 입력 사항입니다.');
            }
        };

        document.getElementById('process-all-fixed').onclick = () => {
            this.processAllFixed();
        };

        const toggleBtn = document.getElementById('toggle-fixed-list');
        if (toggleBtn) {
            toggleBtn.onclick = () => {
                this.state.isFixedCostsCollapsed = !this.state.isFixedCostsCollapsed;
                this.saveData();
                renderFixed();
            };
        }

        const toggleIncBtn = document.getElementById('toggle-fixed-income-list');
        if (toggleIncBtn) {
            toggleIncBtn.onclick = () => {
                this.state.isFixedIncomesCollapsed = !this.state.isFixedIncomesCollapsed;
                this.saveData();
                renderFixedIncomes();
            };
        }

        document.getElementById('process-all-fixed-income').onclick = () => {
            this.processAllFixedIncomes();
        };

        document.getElementById('save-mina-pass').onclick = () => {
            const currentPass = document.getElementById('current-mina-pass').value;
            const newPass = document.getElementById('new-mina-pass').value.trim();

            if (!currentPass || !newPass) {
                alert('현재 비밀번호와 새 비밀번호를 모두 입력해주세요.');
                return;
            }

            if (currentPass !== this.state.minaPassword) {
                alert('현재 비밀번호가 일치하지 않습니다.');
                return;
            }

            if (newPass) {
                this.state.minaPassword = newPass;
                this.saveData();
                alert('비밀번호가 성공적으로 변경되었습니다.');
                document.getElementById('current-mina-pass').value = '';
                document.getElementById('new-mina-pass').value = '';
            }
        };

        document.getElementById('add-fixed-income').onclick = () => {
            const name = document.getElementById('fixed-inc-name').value;
            const amount = document.getElementById('fixed-inc-amount').value;
            const incomeType = document.getElementById('fixed-inc-type').value;
            const date = document.getElementById('fixed-inc-date').value;
            const category = document.getElementById('fixed-inc-category').value;

            if (name && amount && date) {
                this.state.fixedIncomes.push({ name, amount, incomeType, date, category });
                this.state.fixedIncomes.sort((a, b) => parseInt(a.date) - parseInt(b.date));
                this.saveData();
                renderFixedIncomes();
                ['fixed-inc-name', 'fixed-inc-amount', 'fixed-inc-date'].forEach(id => document.getElementById(id).value = '');
            } else {
                alert('항목명, 금액, 입금일은 필수 입력 사항입니다.');
            }
        };

        renderFixed();
        renderFixedIncomes();
        renderCategories();
        renderSourceDropdown();
        updateTotals();
    },

    deleteFixedIncome(index) {
        this.state.fixedIncomes.splice(index, 1);
        this.saveData();
        this.initSettings();
    },

    processFixedIncome(index) {
        const item = this.state.fixedIncomes[index];
        const currentYearMonth = new Date().toISOString().slice(0, 7);
        
        const alreadyAdded = this.state.transactions.some(t => 
            t.isAutoIncome && t.fixedIncomeName === item.name && t.date.startsWith(currentYearMonth)
        );

        if (alreadyAdded) {
            alert(`'${item.name}' 항목은 이미 이번 달 수입으로 처리되었습니다.`);
            return;
        }

        const day = String(item.date).padStart(2, '0');
        const transactionDate = `${currentYearMonth}-${day}`;

        this.state.transactions.unshift({
            id: Date.now(),
            type: 'income',
            incomeType: item.incomeType || 'common',
            date: transactionDate,
            merchant: `[고정] ${item.name}`,
            amount: parseInt(item.amount),
            category: item.category || '급여',
            isAutoIncome: true,
            fixedIncomeName: item.name
        });

        this.saveData();
        alert(`'${item.name}' 수입처리가 완료되었습니다.`);
        this.initSettings();
    },

    processAllFixedIncomes() {
        const currentYearMonth = new Date().toISOString().slice(0, 7);
        let addedCount = 0;

        this.state.fixedIncomes.forEach(item => {
            const alreadyAdded = this.state.transactions.some(t => 
                t.isAutoIncome && t.fixedIncomeName === item.name && t.date.startsWith(currentYearMonth)
            );

            if (!alreadyAdded) {
                const day = String(item.date).padStart(2, '0');
                const transactionDate = `${currentYearMonth}-${day}`;

                this.state.transactions.unshift({
                    id: Date.now() + addedCount,
                    type: 'income',
                    incomeType: item.incomeType || 'common',
                    date: transactionDate,
                    merchant: `[고정] ${item.name}`,
                    amount: parseInt(item.amount),
                    category: item.category || '급여',
                    isAutoIncome: true,
                    fixedIncomeName: item.name
                });
                addedCount++;
            }
        });

        if (addedCount > 0) {
            this.saveData();
            alert(`${addedCount}개의 고정 수입 처리가 완료되었습니다.`);
            this.initSettings();
        } else {
            alert('이미 모든 고정 수입이 처리되었습니다.');
        }
    },

    deleteCategory(type, index) {
        if (type === 'expense') {
            this.state.categories.splice(index, 1);
        } else {
            this.state.incomeCategories.splice(index, 1);
        }
        this.saveData();
        this.initSettings();
    },

    deletePaymentMethod(type, index) {
        this.state.paymentMethods[type].splice(index, 1);
        this.saveData();
        this.initSettings();
    },

    deleteFixed(index) {
        this.state.fixedCosts.splice(index, 1);
        this.saveData();
        this.initSettings();
    },

    processFixed(index) {
        const item = this.state.fixedCosts[index];
        const currentYearMonth = new Date().toISOString().slice(0, 7);
        
        const alreadyAdded = this.state.transactions.some(t => 
            t.isAutoFixed && t.fixedCostName === item.name && t.date.startsWith(currentYearMonth)
        );

        if (alreadyAdded) {
            alert(`'${item.name}' 항목은 이미 이번 달 지출로 처리되었습니다.`);
            return;
        }

        const day = String(item.date).padStart(2, '0');
        const transactionDate = `${currentYearMonth}-${day}`;

        this.state.transactions.unshift({
            id: Date.now(),
            type: 'expense',
            spendingType: item.spendingType || 'common',
            date: transactionDate,
            merchant: `[고정] ${item.name}`,
            amount: parseInt(item.amount),
            category: item.category || '기타',
            paymentMethod: { 
                type: this.state.paymentMethods.cards.includes(item.source) ? 'card' : 'account', 
                name: item.source || '자동이체' 
            },
            isAutoFixed: true,
            fixedCostName: item.name
        });

        this.saveData();
        alert(`'${item.name}' 지출처리가 완료되었습니다.`);
        this.renderFixed(); // To refresh if needed, though not strictly necessary
    },

    processAllFixed() {
        const currentYearMonth = new Date().toISOString().slice(0, 7);
        let addedCount = 0;

        this.state.fixedCosts.forEach(item => {
            const alreadyAdded = this.state.transactions.some(t => 
                t.isAutoFixed && t.fixedCostName === item.name && t.date.startsWith(currentYearMonth)
            );

            if (!alreadyAdded) {
                const day = String(item.date).padStart(2, '0');
                const transactionDate = `${currentYearMonth}-${day}`;

                this.state.transactions.unshift({
                    id: Date.now() + addedCount,
                    type: 'expense',
                    spendingType: item.spendingType || 'common',
                    date: transactionDate,
                    merchant: `[고정] ${item.name}`,
                    amount: parseInt(item.amount),
                    category: item.category || '기타',
                    paymentMethod: { 
                        type: this.state.paymentMethods.cards.includes(item.source) ? 'card' : 'account', 
                        name: item.source || '자동이체' 
                    },
                    isAutoFixed: true,
                    fixedCostName: item.name
                });
                addedCount++;
            }
        });

        if (addedCount > 0) {
            this.saveData();
            alert(`${addedCount}개의 고정비 지출처리가 완료되었습니다.`);
        } else {
            alert('이미 모든 고정비가 처리되었습니다.');
        }
    },

    calculateEmergencyBalance() {
        // Emergency Fund Balance = Sum(Expenses with Category '비상금') - Sum(Expenses with PM '비상금통장')
        const deposits = this.state.transactions
            .filter(t => t.type === 'expense' && t.category === '비상금')
            .reduce((sum, item) => sum + item.amount, 0);
        
        // Withdrawals = Expenses where '비상금통장' was used as payment method
        const withdrawals = this.state.transactions
            .filter(t => t.type === 'expense' && t.paymentMethod?.name === '비상금통장')
            .reduce((sum, item) => sum + item.amount, 0);
        
        return deposits - withdrawals;
    },

    showEmergencyDetails() {
        this.state.currentPage = 'pm-summary';
        this.state.pendingPmFilter = 'account|비상금통장';
        this.render();
    },

    initPmSummary() {
        const monthSelect = document.getElementById('pm-summary-month');
        const catFilter = document.getElementById('pm-category-filter');
        const filterSelect = document.getElementById('pm-summary-filter');
        const content = document.getElementById('pm-summary-content');

        if (!monthSelect || !catFilter || !filterSelect || !content) return;

        monthSelect.value = this.state.selectedMonth;
        
        // Populate Category Filter
        const allCats = [...this.state.categories, ...this.state.incomeCategories];
        catFilter.innerHTML = '<option value="all">모든 항목</option>' +
            allCats.map(c => `<option value="${c}">${c}</option>`).join('');

        // Populate PM Filter
        const accounts = this.state.paymentMethods.accounts || [];
        const cards = this.state.paymentMethods.cards || [];
        filterSelect.innerHTML = '<option value="all">모든 결제수단</option>' +
            accounts.map(a => `<option value="account|${a}">🏦 ${a}</option>`).join('') +
            cards.map(c => `<option value="card|${c}">💳 ${c}</option>`).join('') +
            '<option value="account|비상금통장">🛡️ 비상금통장</option>';

        if (this.state.pendingPmFilter) {
            filterSelect.value = this.state.pendingPmFilter;
            delete this.state.pendingPmFilter;
        }

        const render = () => {
            const selectedCat = catFilter.value;
            const [type, name] = filterSelect.value.split('|');
            const selectedMonth = monthSelect.value;
            
            const filtered = this.state.transactions.filter(t => {
                const isInMonth = t.date.startsWith(selectedMonth);
                if (!isInMonth) return false;
                
                // Category filter
                if (selectedCat !== 'all' && t.category !== selectedCat) return false;

                // PM filter
                if (filterSelect.value === 'all') return true;

                // Special logic for Emergency Fund: include deposits (category '비상금')
                if (name === '비상금통장') {
                    return (t.paymentMethod?.name === name) || (t.category === '비상금');
                }
                
                return t.paymentMethod && t.paymentMethod.type === type && t.paymentMethod.name === name;
            });

            // Group by payment method for summary cards if "all" is selected
            let summaryHtml = '';
            if (filterSelect.value === 'all') {
                const pmMap = {};
                filtered.filter(t => t.type === 'expense').forEach(t => {
                    const pmKey = t.paymentMethod ? `${t.paymentMethod.type === 'account' ? '🏦' : '💳'} ${t.paymentMethod.name}` : '기타';
                    pmMap[pmKey] = (pmMap[pmKey] || 0) + t.amount;
                });

                summaryHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">';
                for (const [pm, total] of Object.entries(pmMap)) {
                    summaryHtml += `
                        <div class="glass-card" style="padding: 1rem; border-left: 4px solid var(--primary-accent);">
                            <div style="font-size: 0.8rem; color: var(--text-dim);">${pm}</div>
                            <div style="font-size: 1.2rem; font-weight: 700; margin-top: 5px;">₩${total.toLocaleString()}</div>
                        </div>
                    `;
                }
                summaryHtml += '</div>';
            } else {
                const total = filtered.filter(t => t.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
                summaryHtml = `
                    <div class="glass-card" style="padding: 1.5rem; margin-bottom: 2rem; border-left: 4px solid var(--primary-accent); display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 0.9rem; color: var(--text-dim);">${name || '선택된 결제수단'} 합계</div>
                            <div style="font-size: 2rem; font-weight: 700; color: var(--primary-accent);">₩${total.toLocaleString()}</div>
                        </div>
                    </div>
                `;
            }

            // Table
            let tableHtml = `
                <div class="glass-card" style="padding: 0; overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: rgba(0,0,0,0.02);">
                                <th style="padding: 1rem; text-align: left;">날짜</th>
                                <th style="padding: 1rem; text-align: left;">내용</th>
                                <th style="padding: 1rem; text-align: left;">결제수단</th>
                                <th style="padding: 1rem; text-align: right;">금액</th>
                                <th style="padding: 1rem; text-align: center;">삭제</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            filtered.sort((a, b) => b.date.localeCompare(a.date)).forEach(t => {
                const pmLabel = t.paymentMethod ? `${t.paymentMethod.type === 'account' ? '🏦' : '💳'} ${t.paymentMethod.name}` : '-';
                
                // For Emergency Fund view, treat category '비상금' (deposits) as positive
                const isDepositInView = name === '비상금통장' && t.category === '비상금';
                const isPositive = t.type === 'income' || isDepositInView;
                
                tableHtml += `
                    <tr style="border-top: 1px solid var(--glass-border);">
                        <td style="padding: 1rem; font-size: 0.9rem; color: var(--text-dim);">${t.date}</td>
                        <td style="padding: 1rem; font-weight: 500;">${t.merchant}</td>
                        <td style="padding: 1rem; font-size: 0.85rem;">${pmLabel}</td>
                        <td style="padding: 1rem; text-align: right; font-weight: 600; color: ${isPositive ? 'var(--success)' : 'inherit'}">
                            ${isPositive ? '+' : ''}₩${t.amount.toLocaleString()}
                        </td>
                        <td style="padding: 1rem; text-align: center;">
                            <button onclick="App.deleteTransaction(${t.id}); App.initPmSummary();" style="background: none; border: none; color: var(--danger); cursor: pointer; opacity: 0.6; transition: opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">✕</button>
                        </td>
                    </tr>
                `;
            });

            if (filtered.length === 0) {
                tableHtml += '<tr><td colspan="4" style="padding: 3rem; text-align: center; color: var(--text-dim);">내역이 없습니다.</td></tr>';
            }

            tableHtml += `
                        </tbody>
                    </table>
                </div>
            `;

            content.innerHTML = summaryHtml + tableHtml;
        };

        monthSelect.onchange = (e) => {
            this.state.selectedMonth = e.target.value;
            render();
        };
        catFilter.onchange = render;
        filterSelect.onchange = render;

        render();
    }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
