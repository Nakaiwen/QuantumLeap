// 等待 HTML DOM 載入完成後再執行
document.addEventListener('DOMContentLoaded', () => {

    // 在這裡新增一個常數，並用你的金鑰取代 placeholder 文字
    // --- 在這裡貼上你的 API 金鑰 ---
    const PREFILLED_FMP_API_KEY = 'zEmap5KigsQdS8290WKQ3hnAuG96PaNn';

    // 在這裡貼上你的 n8n Webhook URL
    const N8N_WEBHOOK_URL = 'https://nakaiwen.app.n8n.cloud/webhook/9bc415d0-4620-4740-a6bd-ae738d6010ac';

    // --- 獲取頁面上的所有元素 ---
    const symbolInput = document.getElementById('symbol-input');
    const fmpKeyInput = document.getElementById('fmp-key-input');

    // 【步驟 2】在這裡新增一行程式碼，將金鑰自動填入輸入框
    fmpKeyInput.value = PREFILLED_FMP_API_KEY;

    const startDateInput = document.getElementById('start-date-input');
    const endDateInput = document.getElementById('end-date-input');
    const analyzeButton = document.getElementById('analyze-button');
    const n8nButton = document.getElementById('n8n-button');
    const aiAnalysisContainer = document.getElementById('ai-analysis-container');
    const timeframeSelector = document.getElementById('timeframe-selector');

    const welcomeMessage = document.getElementById('welcome-message');
    const resultsContainer = document.getElementById('results-container');
    const loader = document.getElementById('loader');

    const metricsContainer = document.getElementById('metrics-container');
    const chartContainer = document.getElementById('chart-container');
    const tableContainer = document.getElementById('table-container');
    const insiderTableContainer = document.getElementById('insider-table-container');
    const newsContainer = document.getElementById('news-container');
    const ratiosContainer = document.getElementById('ratios-container');

    // --- 初始化日期選擇器 ---
    const today = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(today.getDate() - 90);
    // 格式化成 YYYY-MM-DD
    endDateInput.value = today.toISOString().split('T')[0];
    startDateInput.value = ninetyDaysAgo.toISOString().split('T')[0];
    
    // --- 監聽"開始分析"按鈕的點擊事件 ---
    analyzeButton.addEventListener('click', runAnalysis);

    // 【更新】監聽圖表週期 radio 按鈕的變動事件
    let selectedTimeframe = '1day'; // 預設為日線
    timeframeSelector.addEventListener('change', (event) => {
        // 確認事件來自於 radio 按鈕
        if (event.target.classList.contains('timeframe-radio')) {
            // 更新當前選擇的週期
            selectedTimeframe = event.target.dataset.timeframe;
            // 自動重新執行分析
            runAnalysis();
        }
    });


    // ========================================================================
    // --- 主分析函式 ---
    // ========================================================================

    async function runAnalysis() {
        // 1. 獲取使用者輸入並驗證
        const symbol = symbolInput.value.trim().toUpperCase();
        const apiKey = fmpKeyInput.value.trim();
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        if (!symbol || !apiKey) {
            alert('請輸入股票代碼和 FMP API 金鑰。');
            return;
        }

        // 2. 更新 UI 狀態
        welcomeMessage.classList.add('hidden');
        resultsContainer.classList.add('hidden');
        loader.classList.remove('hidden');
        newsContainer.innerHTML = ''; // 清空舊的新聞內容


        try {
            const [priceRawData, insiderTrades, stockNews, ratings, ratios] = await Promise.all([
                fetchStockData(symbol, startDate, endDate, apiKey, selectedTimeframe),
                fetchInsiderTrades(symbol, apiKey),
                fetchStockNews(symbol, apiKey),
                fetchAnalystRatings(symbol, apiKey),
                fetchKeyRatios(symbol, apiKey)
            ]);
            
            const processedPriceData = processData(priceRawData);

            // 【新增點】對內部人交易數據進行摘要
            let insiderTradingSummary = {
                buy_transactions: 0,
                sell_transactions: 0,
                total_shares_bought: 0,
                total_shares_sold: 0,
                recent_trades_text: "無"
            };
            if (insiderTrades && insiderTrades.length > 0) {
                insiderTrades.forEach(trade => {
                    if (trade.transactionType.startsWith('P')) { // Purchase
                        insiderTradingSummary.buy_transactions += 1;
                        insiderTradingSummary.total_shares_bought += trade.securitiesTransacted;
                    } else { // Sale
                        insiderTradingSummary.sell_transactions += 1;
                        insiderTradingSummary.total_shares_sold += trade.securitiesTransacted;
                    }
                });
                // 格式化最近的 3 筆交易為文字
                insiderTradingSummary.recent_trades_text = insiderTrades.slice(0, 3).map(t => 
                    `${t.transactionDate}: ${t.reportingName} ${t.transactionType.startsWith('P') ? '買入' : '賣出'} ${t.securitiesTransacted.toLocaleString()} 股`
                ).join('; ');
            }

            // 【修改點】產生新的、更精簡的數據摘要給 AI
            if (processedPriceData && processedPriceData.date.length > 0) {
                const lastIndex = processedPriceData.date.length - 1;
                const highPriceInfo = processedPriceData.high.reduce((acc, val, idx) => val > acc.val ? { val, idx } : acc, { val: -Infinity, idx: -1 });
                const lowPriceInfo = processedPriceData.low.reduce((acc, val, idx) => val < acc.val ? { val, idx } : acc, { val: -Infinity, idx: -1 });
                const totalVolume = processedPriceData.volume.reduce((sum, val) => sum + (val || 0), 0);

                currentAnalysisData = {
                    symbol: symbol,
                    timeframe: selectedTimeframe === '1day' ? '日線' : selectedTimeframe === '1week' ? '週線' : '月線',
                    first_date: processedPriceData.date[0],
                    last_date: processedPriceData.date[lastIndex],
                    price_change_percent: ((processedPriceData.close[lastIndex] / processedPriceData.close[0] - 1) * 100).toFixed(2),
                    start_price: processedPriceData.close[0].toFixed(2),
                    end_price: processedPriceData.close[lastIndex].toFixed(2),
                    high_price: Math.max(...processedPriceData.high).toFixed(2),
                    high_price_date: processedPriceData.date[processedPriceData.high.indexOf(Math.max(...processedPriceData.high))],
                    low_price: Math.min(...processedPriceData.low).toFixed(2),
                    low_price_date: processedPriceData.date[processedPriceData.low.indexOf(Math.min(...processedPriceData.low))],
                    latest_close: processedPriceData.close[lastIndex].toFixed(2),
                    latest_ma5: processedPriceData.ma5[lastIndex]?.toFixed(2) || 'N/A',
                    latest_ma20: processedPriceData.ma20[lastIndex]?.toFixed(2) || 'N/A',
                    latest_ma60: processedPriceData.ma60[lastIndex]?.toFixed(2) || 'N/A',
                    latest_macd: processedPriceData.macdLine[lastIndex]?.toFixed(2) || 'N/A',
                    latest_signal: processedPriceData.signalLine[lastIndex]?.toFixed(2) || 'N/A',
                    latest_histogram: processedPriceData.histogram[lastIndex]?.toFixed(2) || 'N/A',
                    latest_rsi: processedPriceData.rsi[lastIndex]?.toFixed(2) || 'N/A',
                    latest_volume: processedPriceData.volume[lastIndex]?.toLocaleString() || 'N/A',
                    average_volume: (totalVolume / processedPriceData.volume.length).toLocaleString(undefined, { maximumFractionDigits: 0 }) || 'N/A',
                    insider_trading_summary: insiderTradingSummary
                };
            } else {
                currentAnalysisData = null;
            }
            
            // 4. 在頁面上顯示結果
            metricsContainer.innerHTML = ''; 
            displayMetrics(processedPriceData);
            displayFundamentals(ratings, ratios);
            plotChart(processedPriceData, insiderTrades, symbol);
            displayDataTable(processedPriceData);
            displayInsiderTradesTable(insiderTrades);
            displayStockNews(stockNews);

            resultsContainer.classList.remove('hidden');
            Plotly.Plots.resize(chartContainer);

        } catch (error) {
            welcomeMessage.classList.remove('hidden');
            welcomeMessage.innerHTML = `<h1>❌ 發生錯誤</h1><p>${error.message}</p>`;
            console.error('分析時發生錯誤:', error);
        } finally {
            // 5. 隱藏載入動畫
            loader.classList.add('hidden');
        }
    }

    // --- 從 FMP API 獲取股票數據 (更新版，支援不同時間週期) ---
    async function fetchStockData(symbol, from, to, apiKey, timeframe = '1day') {
        // 【修改點】使用了傳入的 timeframe 參數
        const url = `https://financialmodelingprep.com/api/v3/historical-chart/${timeframe}/${symbol}?from=${from}&to=${to}&apikey=${apiKey}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            let errorMsg = '無法獲取股票數據。請檢查股票代碼和 API 金鑰是否正確。';
            try {
                const errorData = await response.json();
                if (errorData["Error Message"]) { errorMsg = errorData["Error Message"]; }
            } catch (e) {}
            throw new Error(errorMsg);
        }

        const data = await response.json();
        
        if (!data || data.length === 0) {
            throw new Error('此日期範圍內查無數據。');
        }
        
        return data.reverse();
    }

    // ========================================================================
    // --- 計算技術指標 ---
    // ========================================================================
    function processData(rawData) {
        const data = {
            date: [], open: [], high: [], low: [], close: [], volume: [],
            ma5: [], ma10: [], ma20: [], ma60: [],
            macdLine: [], signalLine: [], histogram: [],
            rsi: []
        };

        rawData.forEach(d => {
            data.date.push(d.date);
            data.open.push(d.open);
            data.high.push(d.high);
            data.low.push(d.low);
            data.close.push(d.close);
            data.volume.push(d.volume);
        });
        
        // 計算移動平均線
        data.ma5 = calculateMA(data.close, 5);
        data.ma10 = calculateMA(data.close, 10);
        data.ma20 = calculateMA(data.close, 20);
        data.ma60 = calculateMA(data.close, 60);

        // 計算 MACD
        const macdData = calculateMACD(data.close);
        data.macdLine = macdData.macdLine;
        data.signalLine = macdData.signalLine;
        data.histogram = macdData.histogram;

        // 計算 RSI
        data.rsi = calculateRSI(data.close);

        return data;
    }

    function calculateMA(closePrices, window) {
        let ma = [];
        for (let i = 0; i < closePrices.length; i++) {
            if (i < window - 1) {
                ma.push(null); // 前面的數據不足，無法計算
            } else {
                let sum = 0;
                for (let j = 0; j < window; j++) {
                    sum += closePrices[i - j];
                }
                ma.push(sum / window);
            }
        }
        return ma;
    }

    function calculateEMA(closePrices, period) {
        let ema = [];
        let multiplier = 2 / (period + 1);
        // 計算第一個 EMA 值，使用簡單移動平均 (SMA)
        let sma = 0;
        for (let i = 0; i < period; i++) {
            sma += closePrices[i];
        }
        ema[period - 1] = sma / period;

        // 計算後續的 EMA
        for (let i = period; i < closePrices.length; i++) {
            let currentEma = (closePrices[i] - ema[i - 1]) * multiplier + ema[i - 1];
            ema.push(currentEma);
        }
        // 在陣列開頭補上 null，使其長度與原陣列一致
        while (ema.length < closePrices.length) {
            ema.unshift(null);
        }
        return ema;
    }

    function calculateMACD(closePrices, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
        const emaShort = calculateEMA(closePrices, shortPeriod);
        const emaLong = calculateEMA(closePrices, longPeriod);
        let macdLine = [];
        for (let i = 0; i < closePrices.length; i++) {
            if (emaShort[i] !== null && emaLong[i] !== null) {
                macdLine.push(emaShort[i] - emaLong[i]);
            } else {
                macdLine.push(null);
            }
        }
        
        const signalLine = calculateEMA(macdLine.filter(val => val !== null), signalPeriod);
        // 補齊 signalLine 前面的 null
        while (signalLine.length < closePrices.length) {
            signalLine.unshift(null);
        }

        let histogram = [];
        for (let i = 0; i < closePrices.length; i++) {
            if (macdLine[i] !== null && signalLine[i] !== null) {
                histogram.push(macdLine[i] - signalLine[i]);
            } else {
                histogram.push(null);
            }
        }

        return { macdLine, signalLine, histogram };
    }

    function calculateRSI(closePrices, period = 14) {
        let rsi = [];
        let gains = 0;
        let losses = 0;

        // 計算第一個 RSI 值
        for (let i = 1; i <= period; i++) {
            let change = closePrices[i] - closePrices[i-1];
            if (change > 0) {
                gains += change;
            } else {
                losses -= change; // losses 是正數
            }
        }
        
        let avgGain = gains / period;
        let avgLoss = losses / period;
        let rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
        rsi[period] = 100 - (100 / (1 + rs));

        // 計算後續的 RSI
        for (let i = period + 1; i < closePrices.length; i++) {
            let change = closePrices[i] - closePrices[i-1];
            let gain = change > 0 ? change : 0;
            let loss = change < 0 ? -change : 0;
            
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
            
            rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
            rsi.push(100 - (100 / (1 + rs)));
        }
        
        // 在陣列開頭補上 null
        while(rsi.length < closePrices.length) {
            rsi.unshift(null);
        }

        return rsi;
    }

    // --- 顯示頂部的統計資訊 ---
    function displayMetrics(data) {
        const startPrice = data.close[0];
        const endPrice = data.close[data.close.length - 1];
        const changeAbs = endPrice - startPrice;
        const changePct = (changeAbs / startPrice) * 100;
        const deltaClass = changeAbs >= 0 ? 'positive' : 'negative';

        metricsContainer.innerHTML = `
            <div class="metric">
                <div class="metric-title">起始價格</div>
                <div class="metric-value">$${startPrice.toFixed(2)}</div>
            </div>
            <div class="metric">
                <div class="metric-title">結束價格</div>
                <div class="metric-value">$${endPrice.toFixed(2)}</div>
            </div>
            <div class="metric">
                <div class="metric-title">價格變化</div>
                <div class="metric-value ${deltaClass}">${changePct.toFixed(2)}%</div>
                <div class="metric-delta ${deltaClass}">$${changeAbs.toFixed(2)}</div>
            </div>
        `;
    }

   // --- 使用 Plotly.js 繪製圖表 ---
    function plotChart(data, insiderTrades, symbol) {

        // 【新增點】處理內部人交易數據，轉換為圖表標記
        const insiderBuys = { x: [], y: [], text: [] };
        const insiderSells = { x: [], y: [], text: [] };

        insiderTrades.forEach(trade => {
            // 檢查交易日期是否在圖表範圍內
            if (new Date(trade.transactionDate) >= new Date(data.date[0]) && new Date(trade.transactionDate) <= new Date(data.date[data.date.length - 1])) {
                const hoverText = `<b>${trade.reportingName}</b><br>${trade.transactionType.startsWith('P') ? '買入' : '賣出'} ${trade.securitiesTransacted.toLocaleString()} 股<br>@ $${trade.price.toFixed(2)}`;
                if (trade.transactionType.startsWith('P')) { // P-Purchase
                    insiderBuys.x.push(trade.transactionDate);
                    insiderBuys.y.push(trade.price);
                    insiderBuys.text.push(hoverText);
                } else { // S-Sale
                    insiderSells.x.push(trade.transactionDate);
                    insiderSells.y.push(trade.price);
                    insiderSells.text.push(hoverText);
                }
            }
        });

        const traceInsiderBuys = {
            x: insiderBuys.x, y: insiderBuys.y, text: insiderBuys.text,
            mode: 'markers', type: 'scatter', name: '內部人買入',
            hoverinfo: 'text',
            marker: { symbol: 'arrow-up', color: 'green', size: 10, line: { color: 'black', width: 1 } },
            yaxis: 'y1'
        };
        const traceInsiderSells = {
            x: insiderSells.x, y: insiderSells.y, text: insiderSells.text,
            mode: 'markers', type: 'scatter', name: '內部人賣出',
            hoverinfo: 'text',
            marker: { symbol: 'arrow-down', color: 'red', size: 10, line: { color: 'black', width: 1 } },
            yaxis: 'y1'
        };

        // --- 主圖：K線、均線、成交量 ---
        const traceCandlestick = {
            x: data.date, open: data.open, high: data.high, low: data.low, close: data.close,
            type: 'candlestick', name: 'K線', yaxis: 'y1'
        };
        const traceMa5 = { x: data.date, y: data.ma5, type: 'scatter', mode: 'lines', name: 'MA5', line: { color: 'blue', width: 1.5 }, yaxis: 'y1' };
        const traceMa10 = { x: data.date, y: data.ma10, type: 'scatter', mode: 'lines', name: 'MA10', line: { color: 'orange', width: 1.5 }, yaxis: 'y1' };
        const traceMa20 = { x: data.date, y: data.ma20, type: 'scatter', mode: 'lines', name: 'MA20', line: { color: 'green', width: 1.5 }, yaxis: 'y1' };
        const traceMa60 = { x: data.date, y: data.ma60, type: 'scatter', mode: 'lines', name: 'MA60', line: { color: 'purple', width: 1.5 }, yaxis: 'y1' };
        const traceVolume = { x: data.date, y: data.volume, type: 'bar', name: '成交量', marker: { color: 'rgba(128,128,128,0.5)' }, yaxis: 'y2' };

        // --- 副圖1：MACD ---
        const traceMacdLine = { x: data.date, y: data.macdLine, type: 'scatter', mode: 'lines', name: 'MACD', line: { color: '#e67e22' }, yaxis: 'y3' };
        const traceSignalLine = { x: data.date, y: data.signalLine, type: 'scatter', mode: 'lines', name: 'Signal', line: { color: '#3498db' }, yaxis: 'y3' };
        const traceHistogram = { x: data.date, y: data.histogram, type: 'bar', name: 'Histogram', marker: { 
            color: data.histogram.map(val => val > 0 ? 'rgba(239, 83, 80, 0.5)' : 'rgba(38, 166, 154, 0.5)') // 紅漲綠跌
        }, yaxis: 'y3' };
        
        // --- 副圖2：RSI ---
        const traceRsi = { x: data.date, y: data.rsi, type: 'scatter', mode: 'lines', name: 'RSI', line: { color: '#9b59b6' }, yaxis: 'y4' };

        // --- 圖表佈局設定 (Layout) ---
        const layout = {
            title: `${symbol} 股價 K 線圖與技術指標`,
            height: 950,
            xaxis: {
                anchor: 'y4',
                domain: [0, 0],
                rangeslider: { visible: false }
            },
            // 【修改點】調整所有 Y 軸的 domain，創造間距
            yaxis: { // 主圖 (價格)
                domain: [0.55, 1], // 佔據上方 45%
            },
            yaxis2: { // 主圖 (成交量)
                domain: [0.55, 1],
                overlaying: 'y',
                side: 'right',
                showticklabels: false,
                range: [0, Math.max(...data.volume) * 3]
            },
            yaxis3: { // 副圖1 (MACD)
                domain: [0.30, 0.5], // 佔據 22%
            },
            yaxis4: { // 副圖2 (RSI)
                domain: [0,0.22], // 佔據 22%
            },
            legend: {
                traceorder: 'normal'
            },
            margin: {
                r: 150
            },
            showlegend: true,
            shapes: [
                { type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y4', y0: 70, y1: 70, line: { color: 'red', width: 1, dash: 'dash' } },
                { type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y4', y0: 30, y1: 30, line: { color: 'green', width: 1, dash: 'dash' } }
            ],
            // 【修改點】對應新的 domain，調整註解的 Y 座標
            annotations: [
                {
                    text: 'MACD (判斷趨勢方向和強度)',
                    font: { size: 12, color: '#666' },
                    showarrow: false,
                    x: 0.5,
                    xref: 'paper',
                    y: 0.50, // 放在 MACD 圖正上方的新位置
                    yref: 'paper',
                    xanchor: 'center',
                    yanchor: 'bottom'
                },
                {
                    text: 'RSI (買賣盤力道)',
                    font: { size: 12, color: '#666' },
                    showarrow: false,
                    x: 0.5,
                    xref: 'paper',
                    y: 0.22, // 放在 RSI 圖正上方的新位置
                    yref: 'paper',
                    xanchor: 'center',
                    yanchor: 'bottom'
                }
            ]
        };

        // --- 【修改點】將所有圖表數據組裝在一起 ---
        const plotData = [
            traceCandlestick, traceMa5, traceMa10, traceMa20, traceMa60, traceVolume,
            traceMacdLine, traceSignalLine, traceHistogram,
            traceRsi,
            traceInsiderBuys, traceInsiderSells // 新增內部人交易標記
        ];
        
        Plotly.newPlot('chart-container', plotData, layout, {responsive: true});
    }

    // --- 從 FMP API 獲取股票新聞 ---
    async function fetchStockNews(symbol, apiKey) {
        const url = `https://financialmodelingprep.com/api/v3/stock_news?tickers=${symbol}&limit=10&apikey=${apiKey}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('無法獲取股票新聞數據。此功能可能需要 FMP 付費訂閱方案。');
        }
        const data = await response.json();
        return data || [];
    }

    // --- 顯示股票新聞列表 ---
    function displayStockNews(stockNews) {
        if (!stockNews || stockNews.length === 0) {
            newsContainer.innerHTML = '<h3>相關新聞</h3><p>近期無相關新聞。</p>';
            return;
        }

        let newsHTML = `
            <h3>相關新聞</h3>
            <div class="news-list">
        `;

        stockNews.forEach(news => {
            // 【*** 修改點在這裡 ***】
            // 1. 建立一個變數來存放圖片的 HTML
            let imageHTML = '';

            // 2. 檢查 news.image 是否存在且不為空
            if (news.image) {
                // 3. 如果存在，才產生 <img> 標籤
                imageHTML = `<img src="${news.image}" alt="News Image" class="news-image" onerror="this.style.display='none'">`;
            }
            
            // 格式化日期
            const publishedDate = new Date(news.publishedDate).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
            
            newsHTML += `
                <div class="news-item">
                    ${imageHTML} {/* <--- 在這裡插入圖片 HTML，如果沒有圖片，這裡就是空的 */}
                    <div class="news-content">
                        <a href="${news.url}" target="_blank" class="news-title">${news.title}</a>
                        <div class="news-meta">
                            <span>${news.site}</span> - <span>${publishedDate}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        newsHTML += '</div>';
        newsContainer.innerHTML = newsHTML;
    }

    // --- 從 FMP API 獲取分析師評級 ---
    async function fetchAnalystRatings(symbol, apiKey) {
        const url = `https://financialmodelingprep.com/api/v3/rating/${symbol}?apikey=${apiKey}`;
        const response = await fetch(url);
        if (!response.ok) {
            console.error('無法獲取分析師評級數據。此功能可能需要更高階的 FMP 訂閱方案。');
            return []; // 回傳空陣列，避免程式崩潰
        }
        return await response.json();
    }

    // --- 從 FMP API 獲取關鍵財務指標 ---
    async function fetchKeyRatios(symbol, apiKey) {
        const url = `https://financialmodelingprep.com/api/v3/key-metrics-ttm/${symbol}?apikey=${apiKey}`;
        const response = await fetch(url);
        if (!response.ok) {
            console.error('無法獲取關鍵財務指標。此功能可能需要更高階的 FMP 訂閱方案。');
            return []; // 回傳空陣列
        }
        return await response.json();
    }

    // --- 顯示分析師評級和關鍵財務指標 ---
    function displayFundamentals(ratings, ratios) {
        // --- 處理分析師評級 ---
        if (ratings && ratings.length > 0) {
            const latestRating = ratings[0];
            const score = latestRating.ratingScore;
            const recommendation = latestRating.rating;
            
            // 根據分數決定顏色 (1-5分，1最好)
            const colors = ['#16a34a', '#84cc16', '#facc15', '#f97316', '#dc2626'];
            const barColor = colors[score - 1] || '#9ca3af';
            
            const ratingHTML = `
                <div class="metric">
                    <div class="metric-title">分析師評級</div>
                    <div class="metric-value">${recommendation}</div>
                    <div class="rating-bar-container">
                        <div class="rating-bar" style="width: ${((5 - score) / 4) * 100}%; background-color: ${barColor};"></div>
                    </div>
                </div>
            `;
            // 將評級卡片插入到指標區的最前面
            metricsContainer.insertAdjacentHTML('afterbegin', ratingHTML);
        }

        // --- 處理關鍵財務指標 ---
        if (ratios && ratios.length > 0) {
            const latestRatios = ratios[0];
            const selectedRatios = {
                '本益比 (P/E)': latestRatios.peRatioTTM,
                '股價營收比 (P/S)': latestRatios.priceToSalesRatioTTM,
                '股東權益報酬率 (ROE)': latestRatios.roeTTM,
                '負債權益比 (D/E)': latestRatios.debtToEquityTTM,
                '市值 (Market Cap)': latestRatios.marketCapTTM,
                '股息殖利率 (Dividend Yield)': latestRatios.dividendYieldTTM
            };

            let ratiosHTML = `
                <h3>關鍵財務指標 (TTM)</h3>
                <div class="ratios-grid">
            `;

            for (const [label, value] of Object.entries(selectedRatios)) {
                let displayValue = 'N/A';
                if (typeof value === 'number') {
                    if (label === '市值 (Market Cap)') {
                        displayValue = `$${(value / 1e9).toFixed(2)}B`; // 轉換為十億
                    } else if (label.includes('Yield') || label.includes('ROE')) {
                        displayValue = `${(value * 100).toFixed(2)}%`;
                    } else {
                        displayValue = value.toFixed(2);
                    }
                }
                
                ratiosHTML += `
                    <div class="ratio-item">
                        <span class="ratio-label">${label}</span>
                        <span class="ratio-value">${displayValue}</span>
                    </div>
                `;
            }

            ratiosHTML += '</div>';
            ratiosContainer.innerHTML = ratiosHTML;
        } else {
            ratiosContainer.innerHTML = '<h3>關鍵財務指標 (TTM)</h3><p>無可用數據。</p>';
        }
    }

    // --- 顯示底部的歷史數據表格 ---
    function displayDataTable(data) {
        let tableHTML = `
            <h3>最近10筆歷史數據</h3>
            <table>
                <tr>
                    <th>日期</th>
                    <th>收盤價</th>
                    <th>開盤價</th>
                    <th>最高價</th>
                    <th>最低價</th>
                    <th>成交量</th>
                </tr>
        `;
        const lastTen = data.date.length > 10 ? 10 : data.date.length;
        for (let i = data.date.length - 1; i >= data.date.length - lastTen; i--) {
            tableHTML += `
                <tr>
                    <td>${data.date[i]}</td>
                    <td>$${data.close[i].toFixed(2)}</td>
                    <td>$${data.open[i].toFixed(2)}</td>
                    <td>$${data.high[i].toFixed(2)}</td>
                    <td>$${data.low[i].toFixed(2)}</td>
                    <td>${data.volume[i].toLocaleString()}</td>
                </tr>
            `;
        }
        tableHTML += '</table>';
        tableContainer.innerHTML = tableHTML;
    }

    // --- 從 FMP API 獲取內部人交易數據 ---
    async function fetchInsiderTrades(symbol, apiKey) {
        // 注意: 內部人交易是 v4 API
        const url = `https://financialmodelingprep.com/api/v4/insider-trading?symbol=${symbol}&page=0&apikey=${apiKey}`;
        const response = await fetch(url);
        if (!response.ok) {
            // 這個 API 很可能需要付費方案，所以我們給出特定的錯誤提示
            throw new Error('無法獲取內部人交易數據。此功能可能需要更高階的 FMP 訂閱方案。');
        }
        const data = await response.json();
        return data || [];
    }

    // --- 顯示內部人交易表格 ---
    function displayInsiderTradesTable(insiderTrades) {
        if (insiderTrades.length === 0) {
            insiderTableContainer.innerHTML = '<h3>內部人交易資訊</h3><p>在選定期間內無內部人交易數據。</p>';
            return;
        }

        let tableHTML = `
            <h3>內部人交易資訊</h3>
            <table>
                <tr>
                    <th>申報日期</th>
                    <th>交易日期</th>
                    <th>內部人姓名</th>
                    <th>類型</th>
                    <th>股數</th>
                    <th>價格</th>
                    <th>總金額</th>
                </tr>
        `;
        // 我們只顯示最近的 20 筆交易
        const recentTrades = insiderTrades.slice(0, 20);

        for (const trade of recentTrades) {
            const typeClass = trade.transactionType.startsWith('P') ? 'insider-buy' : 'insider-sell';
            const typeText = trade.transactionType.startsWith('P') ? '買入' : '賣出';
            const totalValue = trade.securitiesTransacted * trade.price;

            tableHTML += `
                <tr>
                    <td>${trade.filingDate}</td>
                    <td>${trade.transactionDate}</td>
                    <td>${trade.reportingName}</td>
                    <td class="${typeClass}">${typeText}</td>
                    <td>${trade.securitiesTransacted.toLocaleString()}</td>
                    <td>$${trade.price.toFixed(2)}</td>
                    <td>$${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                </tr>
            `;
        }
        tableHTML += '</table>';
        insiderTableContainer.innerHTML = tableHTML;
    }

    // --- 監聽 AI 分析按鈕的點擊事件 ---
    n8nButton.addEventListener('click', runAiAnalysis);

    // --- 打包所有數據以發送到 n8n ---
    function gatherDataForAI() {
        // 這是一個假設的函式，你需要確保這些變數在 runAiAnalysis 能夠被存取
        // 我們將在 runAnalysis 內部直接建立這個物件
        return null; 
    }
    // ========================================================================
    // --- 執行 AI 分析 ---
    // ========================================================================
    async function runAiAnalysis() {
        // 【修改點】檢查 N8N_WEBHOOK_URL 是否為空，而不是輸入框
        if (!N8N_WEBHOOK_URL || N8N_WEBHOOK_URL.includes('【')) {
            alert('請先在 script.js 檔案的開頭填寫你的 n8n Webhook URL。');
            return;
        }

        if (!currentAnalysisData) {
            alert('請先執行一次股票分析，才能進行 AI 解讀。');
            return;
        }

        aiAnalysisContainer.innerHTML = '<h3>🤖 AI 技術分析</h3><div id="loader"></div>';
        n8nButton.disabled = true;
        n8nButton.textContent = 'AI 分析中...';

        try {
            // 【修改點】fetch 的第一個參數直接使用 N8N_WEBHOOK_URL
            const response = await fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentAnalysisData)
            });

            if (!response.ok) {
                throw new Error(`n8n Webhook 回應錯誤，狀態碼: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.aiAnalysisText) {
                // 【修改點】加入除錯訊息和更穩健的處理方式
                console.log("從 n8n 收到的原始文本:", result.aiAnalysisText);

                let htmlContent = '';
                try {
                    // 確保 marked 函式存在
                    if (typeof marked === 'object' && typeof marked.parse === 'function') {
                        htmlContent = marked.parse(result.aiAnalysisText);
                    } else {
                        console.error("marked.js 沒有被正確載入。");
                        // Fallback: 如果 marked.js 載入失敗，至少處理換行
                        htmlContent = result.aiAnalysisText.replace(/\n/g, '<br>');
                    }
                } catch (e) {
                    console.error("marked.js 解析時發生錯誤:", e);
                    htmlContent = result.aiAnalysisText.replace(/\n/g, '<br>'); // 解析失敗時的 Fallback
                }

                console.log("經 marked.js 解析後的 HTML:", htmlContent);
                
                aiAnalysisContainer.innerHTML = `<h3>🤖 AI 技術分析</h3><div class="ai-content">${htmlContent}</div>`;

            } else {
                throw new Error('n8n 回應的 JSON 中找不到 "aiAnalysisText" 欄位。');
            }

        } catch (error) {
            aiAnalysisContainer.innerHTML = `<h3>🤖 AI 技術分析</h3><p style="color: red;">分析失敗: ${error.message}</p>`;
            console.error('AI 分析時發生錯誤:', error);
        } finally {
            n8nButton.disabled = false;
            n8nButton.textContent = '🤖 執行 AI 分析 (n8n)';
        }
    }

});