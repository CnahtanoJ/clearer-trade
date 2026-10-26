document.addEventListener('alpine:init', () => {
            Alpine.data('appData', () => ({
                activeTab: 'file',
                auditDrawerOpen: false,
                showDisclaimerModal: false,
                equityPnlTab: 'equity',
                donutType: 'asset',
                themeTimer: null,
                theme: 'dark',
                chartTheme: 'classic',
                chartData: null,
                dragOver: false,
                selectedFile: null,
                isAnalyzing: false,
                hasResults: false,
                loadingText: 'Analyzing trading data...',
                
                // Login state
                isLoggedIn: false,
                loginAccessToken: '',
                loginError: '',
                isLoggingIn: false,
                accessToken: localStorage.getItem('access_token') || '',
                
                // Form configs
                useCustomKey: false,
                traderId: '',
                apiKey: '',
                selectedModel: localStorage.getItem('custom_model') || 'deepseek/deepseek-r1',
                
                hasResults: false,
                isAnalyzing: false,
                loadingText: 'Analyzing execution ledger...',
                status: 'STABLE',
                
                // CCXT form bindings
                exchangeId: 'binance',
                exchangeApiKey: '',
                exchangeSecret: '',
                exchangePassword: '',
                
                avgDrift: 0.0,
                metrics: {},
                trades: [],
                rawAudit: "",
                auditRun: false,
                isAuditing: false,
                remainingQuota: null,
                
                // Chart instances
                equityChartInstance: null,
                pnlChartInstance: null,
                strategyVolChartInstance: null,
                hourlyChartInstance: null,
                scatterChartInstance: null,
                regimeChartInstance: null,
                sessionBubbleChartInstance: null,
                
                // Table state
                activeStrategyTab: 'OVERALL',
                showDataEditor: false,

                init() {
                    const savedAccessToken = localStorage.getItem('access_token') || '';
                    const savedApiKey = localStorage.getItem('openrouter_api_key') || '';
                    const savedTraderId = localStorage.getItem('trader_id') || '';
                    
                    this.theme = 'dark';
                    if (savedAccessToken) {
                        this.accessToken = savedAccessToken;
                        this.traderId = savedTraderId;
                        this.apiKey = savedApiKey;
                        this.isLoggedIn = true;
                    }
                    // Initialize document theme class to dark mode always
                    document.documentElement.classList.add('dark');

                    // Load saved dashboard session from LocalStorage
                    this.loadDashboardFromLocalStorage();
                },

                async handleLogin() {
                    this.isLoggingIn = true;
                    this.loginError = '';
                    
                    const formData = new FormData();
                    formData.append('access_token', this.loginAccessToken);
                    
                    try {
                        const response = await fetch('/api/login', {
                            method: 'POST',
                            body: formData
                        });
                        const data = await response.json();
                        if (data.success) {
                            this.accessToken = this.loginAccessToken;
                            this.traderId = data.trader_id;
                            localStorage.setItem('access_token', this.accessToken);
                            localStorage.setItem('trader_id', this.traderId);
                            this.isLoggedIn = true;
                        } else {
                            this.loginError = data.error || 'Login failed.';
                        }
                    } catch (e) {
                        this.loginError = 'Error connecting to the server.';
                    } finally {
                        this.isLoggingIn = false;
                    }
                },

                handleLogout() {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('trader_id');
                    localStorage.removeItem('openrouter_api_key');
                    this.accessToken = '';
                    this.traderId = '';
                    this.apiKey = '';
                    this.useCustomKey = false;
                    this.loginAccessToken = '';
                    this.isLoggedIn = false;
                    this.reset();
                },

                handleFileSelect(event) {
                    const file = event.target.files[0];
                    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
                        this.selectedFile = file;
                    } else {
                        alert('Please select a valid CSV or XLSX file.');
                    }
                },

                handleDrop(event) {
                    this.dragOver = false;
                    const file = event.dataTransfer.files[0];
                    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
                        this.selectedFile = file;
                    } else {
                        alert('Please drop a valid CSV or XLSX file.');
                    }
                },
                
                reset() {
                    this.hasResults = false;
                    this.selectedFile = null;
                    this.rawAudit = "";
                    this.auditRun = false;
                    this.isAuditing = false;
                    this.remainingQuota = null;
                    if(this.$refs.fileInput) this.$refs.fileInput.value = "";
                    localStorage.removeItem('trade_dashboard_data');
                    this.destroyExistingCharts();
                },

                saveDashboardToLocalStorage() {
                    try {
                        const payload = {
                            metrics: this.metrics,
                            trades: this.trades,
                            chartData: this.chartData,
                            status: this.status,
                            rawAudit: this.rawAudit,
                            auditRun: this.auditRun
                        };
                        localStorage.setItem('trade_dashboard_data', JSON.stringify(payload));
                    } catch (e) {
                        console.warn('Failed to save dashboard to LocalStorage:', e);
                    }
                },

                loadDashboardFromLocalStorage() {
                    try {
                        const raw = localStorage.getItem('trade_dashboard_data');
                        if (raw) {
                            const data = JSON.parse(raw);
                            if (data && data.metrics && data.chartData) {
                                this.metrics = data.metrics;
                                this.trades = data.trades || [];
                                this.chartData = data.chartData;
                                this.status = data.status || 'STABLE';
                                this.rawAudit = data.rawAudit || '';
                                this.auditRun = data.auditRun || false;
                                this.hasResults = true;
                                this.$nextTick(() => {
                                    this.initCharts(data.chartData);
                                });
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to load dashboard from LocalStorage:', e);
                    }
                },

                async uploadFile() {
                    if (!this.selectedFile) return;
                    
                    this.loadingText = 'Parsing CSV journal...';
                    this.isAnalyzing = true;
                    
                    const formData = new FormData();
                    formData.append('file', this.selectedFile);
                    
                    try {
                        const response = await fetch('/api/analyze', {
                            method: 'POST',
                            body: formData
                        });
                        
                        const data = await response.json();
                        
                        if (data.success === false || data.error) {
                            alert(data.error || "Failed to analyze file.");
                            this.isAnalyzing = false;
                            return;
                        }
                        
                        this.metrics = data.metrics;
                        this.trades = data.trades;
                        this.chartData = data.chart_data;
                        this.hasResults = true;
                        
                        this.saveDashboardToLocalStorage();

                        this.$nextTick(() => {
                            this.initCharts(data.chart_data);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        });
                        alert('Analysis complete! Check the metrics below.');
                    } catch (error) {
                        alert('An error occurred during analysis.');
                    } finally {
                        this.isAnalyzing = false;
                    }
                },
                
                async saveAndReanalyze() {
                    this.showDataEditor = false;
                    this.isAnalyzing = true;
                    this.loadingText = 'Re-analyzing edited data...';
                    
                    try {
                        const formData = new FormData();
                        formData.append('trades', JSON.stringify(this.trades));
                        
                        const response = await fetch('/api/reanalyze', {
                            method: 'POST',
                            body: formData
                        });
                        const data = await response.json();
                        
                        if (data.success) {
                            this.metrics = data.metrics;
                            this.chartData = data.chart_data;
                            this.trades = data.trades;
                            this.hasResults = true;
                            
                            // Re-render charts
                            this.$nextTick(() => {
                                this.initCharts();
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            });
                            
                            // Reset audit
                            this.rawAudit = "";
                            this.auditRun = false;
                            
                            this.saveDashboardToLocalStorage();

                            alert('Data updated and re-analyzed successfully!');
                        } else {
                            alert(data.error || 'Failed to reanalyze data.');
                        }
                    } catch (error) {
                        alert('An error occurred during re-analysis.');
                    } finally {
                        this.isAnalyzing = false;
                    }
                },
                
                exportToCsv() {
                    if (!this.trades || this.trades.length === 0) {
                        alert("No trades to export.");
                        return;
                    }
                    const headers = Object.keys(this.trades[0]);
                    const csvRows = [];
                    csvRows.push(headers.join(','));
                    for (const row of this.trades) {
                        const values = headers.map(header => {
                            const val = row[header] === null || row[header] === undefined ? "" : row[header];
                            return `"${String(val).replace(/"/g, '""')}"`;
                        });
                        csvRows.push(values.join(','));
                    }
                    const csvString = csvRows.join('\n');
                    const blob = new Blob([csvString], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.setAttribute('hidden', '');
                    a.setAttribute('href', url);
                    a.setAttribute('download', 'cleaned_trades.csv');
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                },

                async loadDemoData() {
                    this.loadingText = 'Loading demo trading log...';
                    this.isAnalyzing = true;
                    try {
                        const response = await fetch('/api/demo');
                        const data = await response.json();
                        
                        if (data.success === false || data.error) {
                            alert(data.error || "Failed to load demo data.");
                            this.isAnalyzing = false;
                            return;
                        }
                        
                        this.metrics = data.metrics;
                        this.trades = data.trades;
                        this.chartData = data.chart_data;
                        this.isAnalyzing = false;
                        this.hasResults = true;
                        
                        this.saveDashboardToLocalStorage();

                        this.$nextTick(() => {
                            this.initCharts(data.chart_data);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        });
                    } catch (error) {
                        console.error(error);
                        alert("An error occurred loading demo data.");
                        this.isAnalyzing = false;
                    }
                },
                
                async syncExchange() {
                    if (!this.exchangeApiKey || !this.exchangeSecret) {
                        alert("Please enter both your Exchange API Key and Secret.");
                        return;
                    }
                    
                    this.loadingText = `Fetching history from ${this.exchangeId}...`;
                    this.isAnalyzing = true;
                    
                    const formData = new FormData();
                    formData.append('exchange_id', this.exchangeId);
                    formData.append('api_key', this.exchangeApiKey);
                    formData.append('secret', this.exchangeSecret);
                    if (this.exchangePassword) {
                        formData.append('password', this.exchangePassword);
                    }
                    
                    try {
                        const response = await fetch('/api/sync', {
                            method: 'POST',
                            body: formData
                        });
                        
                        const data = await response.json();
                        
                        if (data.success === false || data.error) {
                            alert(data.error || "Failed to sync exchange.");
                            this.isAnalyzing = false;
                            return;
                        }
                        
                        this.metrics = data.metrics;
                        this.trades = data.trades;
                        this.chartData = data.chart_data;
                        this.isAnalyzing = false;
                        this.hasResults = true;
                        
                        this.saveDashboardToLocalStorage();

                        this.$nextTick(() => {
                            this.initCharts(data.chart_data);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        });
                        
                    } catch (error) {
                        console.error(error);
                        alert("An error occurred during exchange sync.");
                        this.isAnalyzing = false;
                    }
                },

                async runAudit() {
                    if (this.useCustomKey && !this.apiKey) {
                        alert("Please enter your custom OpenRouter API Key.");
                        return;
                    }
                    if (!this.useCustomKey && !this.accessToken) {
                        alert("Access Token is missing. Please log in again.");
                        return;
                    }

                    // Save values to localStorage
                    if (this.apiKey) {
                        localStorage.setItem('openrouter_api_key', this.apiKey);
                        localStorage.setItem('custom_model', this.selectedModel);
                    }

                    this.isAuditing = true;

                    const formData = new FormData();
                    formData.append('use_custom_key', this.useCustomKey);
                    if (this.useCustomKey) {
                        formData.append('api_key', this.apiKey);
                        formData.append('custom_model', this.selectedModel);
                    } else {
                        formData.append('access_token', this.accessToken);
                    }
                    formData.append('metrics', JSON.stringify(this.metrics));
                    formData.append('trades', JSON.stringify(this.trades));

                    try {
                        const response = await fetch('/api/audit', {
                            method: 'POST',
                            body: formData
                        });

                        const data = await response.json();

                        if (data.success === false || data.error) {
                            this.rawAudit = `<div class="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-xs leading-normal">
                                <strong class="block mb-1 text-sm font-semibold">Audit Failed</strong>
                                ${data.error || "AI Behavioral Audit failed."}
                            </div>`;
                            this.isAuditing = false;
                            this.auditRun = true;
                            return;
                        }

                        this.rawAudit = data.audit;
                        this.status = data.status || 'STABLE';
                        this.remainingQuota = data.remaining !== undefined ? data.remaining : null;
                        
                        this.isAuditing = false;
                        this.auditRun = true;

                        this.saveDashboardToLocalStorage();

                    } catch (error) {
                        console.error(error);
                        this.rawAudit = `<div class="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-xs leading-normal">
                            <strong class="block mb-1 text-sm font-semibold">Audit Error</strong>
                            An unexpected error occurred during AI audit. Please try again.
                        </div>`;
                        this.isAuditing = false;
                        this.auditRun = true;
                    }
                },
                
                resetAudit() {
                    this.rawAudit = "";
                    this.auditRun = false;
                    this.isAuditing = false;
                    this.remainingQuota = null;
                },
                
                async reanalyzeEditedTrades() {
                    this.isAnalyzing = true;
                    this.loadingText = 'Re-analyzing updated tags...';
                    
                    const formData = new FormData();
                    formData.append('trades', JSON.stringify(this.trades));
                    
                    try {
                        const response = await fetch('/api/reanalyze', {
                            method: 'POST',
                            body: formData
                        });
                        
                        const data = await response.json();
                        
                        if (data.success === false || data.error) {
                            alert(data.error || "Failed to re-analyze data.");
                            this.isAnalyzing = false;
                            return;
                        }
                        
                        this.metrics = data.metrics;
                        this.trades = data.trades;
                        
                        this.isAnalyzing = false;
                        
                        this.$nextTick(() => {
                            this.initCharts(data.chart_data);
                        });
                    } catch (error) {
                        console.error(error);
                        alert("An error occurred during re-analysis.");
                        this.isAnalyzing = false;
                    }
                },
                
                downloadEditedCsv() {
                    if (!this.trades || this.trades.length === 0) return;
                    
                    // Create CSV header from first trade object keys
                    const keys = Object.keys(this.trades[0]);
                    const csvRows = [];
                    csvRows.push(keys.join(','));
                    
                    for (const row of this.trades) {
                        const values = keys.map(k => {
                            let val = row[k] === null || row[k] === undefined ? '' : row[k];
                            // Escape commas and quotes
                            val = val.toString().replace(/"/g, '""');
                            if (val.search(/("|,|\n)/g) >= 0) {
                                val = `"${val}"`;
                            }
                            return val;
                        });
                        csvRows.push(values.join(','));
                    }
                    
                    const csvContent = csvRows.join('\n');
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    
                    const link = document.createElement("a");
                    link.setAttribute("href", url);
                    link.setAttribute("download", "edited_trading_log.csv");
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                },

                destroyExistingCharts() {
                    const chartIds = [
                        'equityChart',
                        'pnlChart',
                        'hourlyChart',
                        'scatterChart',
                        'sessionBubbleChart',
                        'regimeChart',
                        'donutChart'
                    ];
                    chartIds.forEach(id => {
                        const canvas = document.getElementById(id);
                        if (canvas) {
                            const chart = Chart.getChart(canvas);
                            if (chart) {
                                chart.destroy();
                            }
                        }
                    });
                    
                    this.equityChartInstance = null;
                    this.pnlChartInstance = null;
                    this.strategyVolChartInstance = null;
                    this.hourlyChartInstance = null;
                    this.scatterChartInstance = null;
                    this.sessionBubbleChartInstance = null;
                    this.regimeChartInstance = null;
                    this.donutChartInstance = null;
                },

                setChartTheme(theme) {
                    if (this.chartTheme === theme) return;
                    this.chartTheme = theme;
                    this.$nextTick(() => {
                        this.initCharts();
                    });
                },

                updateChartColorsOnly() {
                    const isDark = this.theme === 'dark';
                    const isClassic = this.chartTheme === 'classic';
                    const greenColor = 'rgba(52, 211, 153, 0.85)';
                    const redColor = 'rgba(244, 63, 94, 0.85)';

                    const posColor = isClassic ? greenColor : (isDark ? '#ffffff' : '#171717');
                    const negColor = isClassic ? redColor : (isDark ? '#525252' : '#a3a3a3');
                    const posFill = isClassic ? 'rgba(52, 211, 153, 0.05)' : (isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.04)');
                    const gridColor = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(148, 163, 184, 0.4)';
                    const textColor = isDark ? '#cbd5e1' : '#1e293b';

                    Chart.defaults.color = textColor;

                    const updateScalesAndLegend = (chart) => {
                        if (!chart || !chart.options) return;
                        if (chart.options.scales) {
                            Object.values(chart.options.scales).forEach(scale => {
                                if (scale.grid) scale.grid.color = gridColor;
                                if (scale.ticks) scale.ticks.color = textColor;
                                if (scale.title) scale.title.color = textColor;
                            });
                        }
                        if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
                            chart.options.plugins.legend.labels.color = textColor;
                        }
                        if (typeof chart.buildOrUpdateScales === 'function') {
                            chart.buildOrUpdateScales();
                        }
                    };

                    // 1. Equity Chart
                    if (this.equityChartInstance) {
                        updateScalesAndLegend(this.equityChartInstance);
                        if (this.equityChartInstance.data?.datasets?.[0]) {
                            this.equityChartInstance.data.datasets[0].borderColor = posColor;
                            this.equityChartInstance.data.datasets[0].backgroundColor = posFill;
                        }
                        this.equityChartInstance.update('none');
                    }

                    // 2. Daily PnL Chart
                    if (this.pnlChartInstance) {
                        updateScalesAndLegend(this.pnlChartInstance);
                        if (this.pnlChartInstance.data?.datasets?.[0]) {
                            const bars = this.pnlChartInstance.data.datasets[0].data || [];
                            this.pnlChartInstance.data.datasets[0].backgroundColor = bars.map(v => v >= 0 ? posColor : negColor);
                        }
                        this.pnlChartInstance.update('none');
                    }

                    // 3. Hourly Chart
                    if (this.hourlyChartInstance) {
                        updateScalesAndLegend(this.hourlyChartInstance);
                        if (this.hourlyChartInstance.data?.datasets?.[0]) {
                            const bars = this.hourlyChartInstance.data.datasets[0].data || [];
                            this.hourlyChartInstance.data.datasets[0].backgroundColor = bars.map(v => v >= 0 ? posColor : negColor);
                        }
                        this.hourlyChartInstance.update('none');
                    }

                    // 4. Scatter Chart (MAE vs MFE)
                    if (this.scatterChartInstance) {
                        updateScalesAndLegend(this.scatterChartInstance);
                        if (this.scatterChartInstance.data?.datasets) {
                            if (this.scatterChartInstance.data.datasets[0]) {
                                this.scatterChartInstance.data.datasets[0].backgroundColor = posColor;
                            }
                            if (this.scatterChartInstance.data.datasets[1]) {
                                this.scatterChartInstance.data.datasets[1].backgroundColor = negColor;
                                this.scatterChartInstance.data.datasets[1].borderColor = negColor;
                            }
                        }
                        this.scatterChartInstance.update('none');
                    }

                    // 5. Session Bubble Chart
                    if (this.sessionBubbleChartInstance) {
                        updateScalesAndLegend(this.sessionBubbleChartInstance);
                        if (this.sessionBubbleChartInstance.data?.datasets) {
                            if (this.sessionBubbleChartInstance.data.datasets[0]) {
                                this.sessionBubbleChartInstance.data.datasets[0].backgroundColor = isClassic ? 'rgba(52, 211, 153, 0.5)' : (isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(23, 23, 23, 0.6)');
                                this.sessionBubbleChartInstance.data.datasets[0].borderColor = isClassic ? 'rgba(52, 211, 153, 0.8)' : (isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(23, 23, 23, 0.9)');
                            }
                            if (this.sessionBubbleChartInstance.data.datasets[1]) {
                                this.sessionBubbleChartInstance.data.datasets[1].backgroundColor = isClassic ? 'rgba(244, 63, 94, 0.6)' : (isDark ? 'rgba(82, 82, 82, 0.6)' : 'rgba(163, 163, 163, 0.6)');
                                this.sessionBubbleChartInstance.data.datasets[1].borderColor = isClassic ? 'rgba(244, 63, 94, 0.9)' : (isDark ? 'rgba(115, 115, 115, 0.9)' : 'rgba(115, 115, 115, 0.9)');
                            }
                        }
                        this.sessionBubbleChartInstance.update('none');
                    }

                    // 6. Regime Chart
                    if (this.regimeChartInstance) {
                        updateScalesAndLegend(this.regimeChartInstance);
                        if (this.regimeChartInstance.data?.datasets?.[0]) {
                            const bars = this.regimeChartInstance.data.datasets[0].data || [];
                            this.regimeChartInstance.data.datasets[0].backgroundColor = bars.map(v => v >= 0 ? posColor : negColor);
                        }
                        this.regimeChartInstance.update('none');
                    }

                    // 7. Donut Chart
                    this.updateDonutChart();
                },

                toggleTheme(newTheme) {
                    // Dark theme is permanently locked.
                },

                updateEquityPnlVisibility() {
                    const equityCanvas = document.getElementById('equityChart');
                    const pnlCanvas = document.getElementById('pnlChart');
                    if (equityCanvas) {
                        equityCanvas.style.display = this.equityPnlTab === 'equity' ? 'block' : 'none';
                    }
                    if (pnlCanvas) {
                        pnlCanvas.style.display = this.equityPnlTab === 'pnl' ? 'block' : 'none';
                    }
                },

                switchEquityPnlTab(tab) {
                    this.equityPnlTab = tab;
                    this.updateEquityPnlVisibility();
                    this.$nextTick(() => {
                        const activeChart = tab === 'equity' ? this.equityChartInstance : this.pnlChartInstance;
                        if (activeChart) {
                            activeChart.resize();
                            activeChart.options.animation = { duration: 600, easing: 'easeOutQuart' };
                            activeChart.reset();
                            requestAnimationFrame(() => {
                                activeChart.update();
                            });
                        }
                    });
                },

                initCharts(chartDataInput, isThemeToggle = false) {
                    if (chartDataInput) {
                        this.chartData = chartDataInput;
                    }
                    if (!this.chartData) return;
                    const chartData = this.chartData;
                    
                    // Destroy any existing chart instances directly from canvas context to avoid overlay bugs
                    this.destroyExistingCharts();

                    // Determine colors based on theme
                    const isClassic = this.chartTheme === 'classic';
                    const isDark = this.theme === 'dark';
                    const greenColor = 'rgba(52, 211, 153, 0.85)'; // emerald-400
                    const redColor = 'rgba(244, 63, 94, 0.85)';    // rose-500
                    
                    const posColor = isClassic ? greenColor : (isDark ? '#ffffff' : '#171717');
                    const negColor = isClassic ? redColor : (isDark ? '#525252' : '#a3a3a3');
                    const posFill = isClassic ? 'rgba(52, 211, 153, 0.05)' : (isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.04)');
                    const gridColor = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(148, 163, 184, 0.4)';
                    const textColor = isDark ? '#a3a3a3' : '#334155';
                    Chart.defaults.color = textColor;
                    const animConfig = isThemeToggle ? false : { duration: 600, easing: 'easeOutQuart' };

                    // 1. Equity Curve Chart
                    const ctxEquity = document.getElementById('equityChart').getContext('2d');
                    this.equityChartInstance = new Chart(ctxEquity, {
                        type: 'line',
                        data: {
                            labels: chartData.labels,
                            datasets: [{
                                label: 'Cumulative PnL ($)',
                                data: chartData.equity_curve,
                                borderColor: posColor,
                                backgroundColor: posFill,
                                borderWidth: 2,
                                fill: true,
                                tension: 0.15,
                                pointRadius: 0,
                                pointHitRadius: 10
                            }]
                        },
                        options: {
                            animation: animConfig,
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { 
                                legend: { display: false },
                                tooltip: {
                                    callbacks: {
                                        title: (context) => {
                                            const idx = context[0].dataIndex;
                                            const trade = this.trades[idx];
                                            return trade ? (trade.date || new Date(trade.timestamp).toLocaleString()) : '';
                                        },
                                        label: (context) => {
                                            const idx = context.dataIndex;
                                            const trade = this.trades[idx];
                                            if (trade) {
                                                return `Asset: ${trade.asset} | ${trade.side} | PnL: $${trade.pnl.toFixed(2)}`;
                                            }
                                            return `PnL: $${context.raw.toFixed(2)}`;
                                        }
                                    }
                                }
                            },
                            scales: {
                                x: { 
                                    display: true,
                                    grid: { color: gridColor },
                                    ticks: { color: textColor, font: { size: 9 }, maxTicksLimit: 10 }
                                },
                                y: {
                                    grid: { color: gridColor },
                                    ticks: { color: textColor }
                                }
                            }
                        }
                    });
                    
                    // 2. Daily PnL Distribution Chart
                    const ctxPnl = document.getElementById('pnlChart').getContext('2d');
                    const barColors = (chartData.daily_pnl_bars || []).map(val => val >= 0 ? posColor : negColor);
                    this.pnlChartInstance = new Chart(ctxPnl, {
                        type: 'bar',
                        data: {
                            labels: chartData.daily_pnl_labels || [],
                            datasets: [{
                                label: 'Daily Net PnL',
                                data: chartData.daily_pnl_bars || [],
                                backgroundColor: barColors,
                                borderRadius: 0
                            }]
                        },
                        options: {
                            animation: animConfig,
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { 
                                legend: { display: false },
                                tooltip: {
                                    callbacks: {
                                        title: (context) => {
                                            return context[0].label;
                                        },
                                        label: (context) => {
                                            return `Net PnL: $${context.raw.toFixed(2)}`;
                                        }
                                    }
                                }
                            },
                            scales: {
                                x: { 
                                    display: true,
                                    grid: { color: gridColor },
                                    ticks: { color: textColor, font: { size: 9 }, maxTicksLimit: 15 }
                                },
                                y: {
                                    grid: { color: gridColor },
                                    ticks: { color: textColor }
                                }
                            }
                        }
                    });

                    // Helper to determine direction
                    const isLong = (side) => {
                        const s = String(side || "").toLowerCase();
                        return s.includes("long") || s === "b" || s.includes("buy");
                    };

                    // Process trades for advanced metrics
                    let totalDrift = 0;
                    let driftCount = 0;
                    
                    const strategyVols = {};
                    const hourPnl = Array(24).fill(0);
                    const scatterWinners = [];
                    const scatterLosers = [];
                    const regimeExpectancies = {};
                    const regimeTradesList = {};
                    
                    if (this.trades && this.trades.length > 0) {
                        this.trades.forEach(t => {
                            // 30m Drift calculation
                            if (t.px > 0 && t.t_plus_30m_px > 0) {
                                let raw_drift = (t.t_plus_30m_px - t.px) / t.px;
                                let is_long_pos = isLong(t.side);
                                let drift_pct = (is_long_pos ? raw_drift : -raw_drift) * 100;
                                totalDrift += drift_pct;
                                driftCount++;
                            }
                            
                            // Strategy Volume calculation
                            let stg = t.strategy_tag || "UNTAGGED";
                            strategyVols[stg] = (strategyVols[stg] || 0) + 1;
                            
                            // Hourly performance
                            let t_date;
                            if (typeof t.timestamp === 'number') {
                                t_date = new Date(t.timestamp);
                            } else {
                                t_date = new Date(t.timestamp || t.date);
                            }
                            let h = t_date.getHours();
                            if (!isNaN(h)) {
                                hourPnl[h] += t.pnl || 0;
                            }
                            
                            // Scatter MAE vs MFE mapping
                            let pt = { x: t.mae_pct || 0, y: t.mfe_pct || 0, pnl: t.pnl, asset: t.asset };
                            if (t.pnl >= 0) scatterWinners.push(pt);
                            else scatterLosers.push(pt);
                            
                            // Market Regime grouping
                            let reg = t.market_regime || "Low Volatility Chop";
                            if (!regimeTradesList[reg]) {
                                regimeTradesList[reg] = [];
                            }
                            regimeTradesList[reg].push(t);
                        });
                    }
                    
                    this.avgDrift = driftCount > 0 ? totalDrift / driftCount : 0.0;
                    
                    // Expectancy calculations per regime
                    const regimes = ["Low Volatility Chop", "High Volatility Expansion", "Extreme Funding Squeeze"];
                    regimes.forEach(reg => {
                        let list = regimeTradesList[reg] || [];
                        let sumPct = 0;
                        let count = 0;
                        list.forEach(t => {
                            let cost = (t.px && t.sz) ? (t.px * t.sz) : 0;
                            if (cost > 0) {
                                sumPct += (t.pnl / cost) * 100;
                                count++;
                            }
                        });
                        regimeExpectancies[reg] = count > 0 ? sumPct / count : 0.0;
                    });
                    
                    // 4. Execution Timing by Hour Bar Chart
                    const ctxHour = document.getElementById('hourlyChart').getContext('2d');
                    const hourLabels = Array.from({length: 24}, (_, i) => `${i}:00`);
                    const hourColors = hourPnl.map(v => v >= 0 ? posColor : negColor);
                    this.hourlyChartInstance = new Chart(ctxHour, {
                        type: 'bar',
                        data: {
                            labels: hourLabels,
                            datasets: [{
                                label: 'Net PnL ($)',
                                data: hourPnl,
                                backgroundColor: hourColors,
                                borderRadius: 0
                            }]
                        },
                        options: {
                            animation: animConfig,
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                x: { ticks: { color: textColor, font: { size: 8 } } },
                                y: {
                                    grid: { color: gridColor },
                                    ticks: { color: textColor }
                                }
                            }
                        }
                    });
                    
                    // 5. Risk vs. Reward (MAE vs. MFE) Scatter Plot
                    const ctxScatter = document.getElementById('scatterChart').getContext('2d');
                    this.scatterChartInstance = new Chart(ctxScatter, {
                        type: 'scatter',
                        data: {
                            datasets: [
                                {
                                    label: 'Winners',
                                    data: scatterWinners,
                                    backgroundColor: posColor,
                                    pointRadius: 5,
                                    hoverRadius: 7
                                },
                                {
                                    label: 'Losers',
                                    data: scatterLosers,
                                    backgroundColor: negColor,
                                    pointStyle: 'crossRot',
                                    pointRadius: 6,
                                    borderColor: negColor,
                                    borderWidth: 2,
                                    hoverRadius: 8
                                }
                            ]
                        },
                        options: {
                            animation: animConfig,
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    labels: { color: textColor, font: { size: 10 } }
                                },
                                tooltip: {
                                    callbacks: {
                                        label: function(context) {
                                            const p = context.raw;
                                            return `${p.asset}: MAE ${p.x.toFixed(2)}%, MFE ${p.y.toFixed(2)}% | PnL: $${p.pnl.toFixed(2)}`;
                                        }
                                    }
                                }
                            },
                            scales: {
                                x: {
                                    title: { display: true, text: 'MAE %', color: textColor, font: { size: 10 } },
                                    ticks: { color: textColor },
                                    grid: { color: gridColor }
                                },
                                y: {
                                    title: { display: true, text: 'MFE %', color: textColor, font: { size: 10 } },
                                    ticks: { color: textColor },
                                    grid: { color: gridColor }
                                }
                            }
                        }
                    });
                    
                    // 6. Dynamic Trading Sessions Bubble Chart
                    const ctxSession = document.getElementById('sessionBubbleChart').getContext('2d');
                    const sessionData = (this.metrics.sessions_list || []).map(s => ({
                        x: s.trade_count,
                        y: s.pnl,
                        r: Math.max(5, Math.min(20, s.duration_hours * 2.5)),
                        is_tilt: s.is_tilt,
                        id: s.session_id,
                        density: s.trade_density
                    }));
                    this.sessionBubbleChartInstance = new Chart(ctxSession, {
                        type: 'bubble',
                        data: {
                            datasets: [
                                {
                                    label: 'Controlled Sessions',
                                    data: sessionData.filter(s => !s.is_tilt),
                                    backgroundColor: isClassic ? 'rgba(52, 211, 153, 0.5)' : (isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(23, 23, 23, 0.6)'),
                                    borderColor: isClassic ? 'rgba(52, 211, 153, 0.8)' : (isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(23, 23, 23, 0.9)'),
                                    borderWidth: 1
                                },
                                {
                                    label: 'TILT Sessions',
                                    data: sessionData.filter(s => s.is_tilt),
                                    backgroundColor: isClassic ? 'rgba(244, 63, 94, 0.6)' : (isDark ? 'rgba(82, 82, 82, 0.6)' : 'rgba(163, 163, 163, 0.6)'),
                                    borderColor: isClassic ? 'rgba(244, 63, 94, 0.9)' : (isDark ? 'rgba(115, 115, 115, 0.9)' : 'rgba(115, 115, 115, 0.9)'),
                                    borderWidth: 1.5
                                }
                            ]
                        },
                        options: {
                            animation: animConfig,
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    labels: { color: textColor, font: { size: 10 } }
                                },
                                tooltip: {
                                    callbacks: {
                                        label: function(context) {
                                            const p = context.raw;
                                            return `Session ${p.id}: Trades: ${p.x} | PnL: $${p.y.toFixed(2)} | Density: ${p.density.toFixed(1)} trades/hr`;
                                        }
                                    }
                                }
                            },
                            scales: {
                                x: {
                                    title: { display: true, text: 'Trades per Session', color: textColor, font: { size: 10 } },
                                    ticks: { color: textColor },
                                    grid: { color: gridColor }
                                },
                                y: {
                                    title: { display: true, text: 'Session PnL ($)', color: textColor, font: { size: 10 } },
                                    ticks: { color: textColor },
                                    grid: { color: gridColor }
                                }
                            }
                        }
                    });

                    // 7. Market Regime Expectancy Bar Chart
                    const ctxRegime = document.getElementById('regimeChart').getContext('2d');
                    const regimeLabels = ["Low Volatility Chop", "High Volatility Expansion", "Extreme Funding Squeeze"];
                    const regimeData = regimeLabels.map(r => regimeExpectancies[r] || 0.0);
                    const regimeColors = regimeData.map(v => v >= 0 ? posColor : negColor);
                    this.regimeChartInstance = new Chart(ctxRegime, {
                        type: 'bar',
                        data: {
                            labels: regimeLabels,
                            datasets: [{
                                label: 'Expectancy %',
                                data: regimeData,
                                backgroundColor: regimeColors,
                                borderRadius: 0
                            }]
                        },
                        options: {
                            animation: animConfig,
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                x: { ticks: { color: textColor, font: { size: 9 } } },
                                y: {
                                    grid: { color: gridColor },
                                    ticks: { color: textColor }
                                }
                            }
                        }
                    });

                    this.updateDonutChart();
                    this.updateEquityPnlVisibility();
                    this.$nextTick(() => {
                        [
                            this.equityChartInstance,
                            this.pnlChartInstance,
                            this.hourlyChartInstance,
                            this.scatterChartInstance,
                            this.sessionBubbleChartInstance,
                            this.regimeChartInstance,
                            this.donutChartInstance
                        ].forEach(chart => {
                            if (chart) chart.resize();
                        });
                    });
                },
                
                updateDonutChart() {
                    if (!this.chartData) return;
                    
                    const canvas = document.getElementById('donutChart');
                    if (!canvas) return;
                    
                    const existingChart = Chart.getChart(canvas);
                    if (existingChart) existingChart.destroy();
                    
                    const ctxDonut = canvas.getContext('2d');
                    
                    let dataMap = {};
                    if (this.donutType === 'asset') dataMap = this.chartData.asset_exposure || {};
                    else if (this.donutType === 'direction') dataMap = this.chartData.direction_exposure || {};
                    else if (this.donutType === 'strategy') dataMap = this.chartData.strategy_exposure || {};
                    
                    const rawLabels = Object.keys(dataMap);
                    const data = Object.values(dataMap);
                    const total = data.reduce((acc, val) => acc + val, 0);
                    
                    const labels = rawLabels.map((label, i) => {
                        const val = data[i];
                        const perc = total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%';
                        return `${label} (${perc})`;
                    });
                    
                    const isDark = document.documentElement.classList.contains('dark');
                    const isClassic = this.chartTheme === 'classic';
                    const legendTextColor = isDark ? '#ffffff' : '#1f2937';
                    
                    let bgColors;
                    if (isClassic) {
                        bgColors = [
                            '#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', 
                            '#ec4899', '#06b6d4', '#14b8a6', '#f97316', '#6366f1'
                        ];
                    } else {
                        bgColors = isDark ? [
                            '#ffffff', '#a3a3a3', '#525252', '#262626', '#e5e5e5', 
                            '#d4d4d8', '#737373', '#404040', '#171717', '#f5f5f5'
                        ] : [
                            '#0f172a', '#334155', '#64748b', '#94a3b8', '#cbd5e1', 
                            '#475569', '#1e293b', '#64748b', '#0f172a', '#f1f5f9'
                        ];
                    }
                    
                    this.donutChartInstance = new Chart(ctxDonut, {
                        type: 'doughnut',
                        data: {
                            labels: labels,
                            datasets: [{
                                data: data,
                                backgroundColor: bgColors.slice(0, labels.length),
                                borderWidth: 2,
                                borderColor: isDark ? '#0a0a0a' : '#ffffff'
                            }]
                        },
                        options: {
                            animation: { duration: 600, easing: 'easeOutQuart' },
                            responsive: true,
                            maintainAspectRatio: false,
                            cutout: '75%',
                            plugins: {
                                legend: {
                                    position: 'right',
                                    labels: {
                                        color: legendTextColor,
                                        font: { size: 10 }
                                    }
                                }
                            }
                        }
                    });
                }
            }));
        });