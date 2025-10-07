// 等待 HTML DOM 載入完成後再執行
document.addEventListener('DOMContentLoaded', () => {

    // 在這裡新增一個常數，並用你的金鑰取代 placeholder 文字
    // --- 在這裡貼上你的 API 金鑰 ---
    const PREFILLED_FMP_API_KEY = 'zEmap5KigsQdS8290WKQ3hnAuG96PaNn';

    // 在這裡貼上你的 n8n Webhook URL
    const N8N_WEBHOOK_URL = 'https://nakaiwen.app.n8n.cloud/webhook/9bc415d0-4620-4740-a6bd-ae738d6010ac';

    // 在這裡貼上你「反轉機會流程」的 Screener Webhook URL
    const N8N_SCREENER_WEBHOOK_URL = 'https://nakaiwen.app.n8n.cloud/webhook/2684a080-a59d-4e28-aee5-a1d76a55d57b';

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
    const rsiPeriodInput = document.getElementById('rsi-period-input');
    const rsiPeriodValue = document.getElementById('rsi-period-value');
    const screenerButton = document.getElementById('screener-button');
    const insiderScreenerButton = document.getElementById('insider-screener-button');

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
    endDateInput.value = today.toISOString().split('T')[0];
    startDateInput.value = ninetyDaysAgo.toISOString().split('T')[0];

    // 【*** 在這裡新增對新按鈕的監聽 ***】
    screenerButton.addEventListener('click', runScreener);
    insiderScreenerButton.addEventListener('click', runInsiderScreener);

    // --- 監聽 RSI 滑桿的變動事件 ---
    rsiPeriodInput.addEventListener('input', (event) => {
        rsiPeriodValue.textContent = event.target.value;
    });
    // 當用戶放開滑鼠時，自動重新分析
    rsiPeriodInput.addEventListener('change', runAnalysis);
    
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
        const rsiPeriod = parseInt(rsiPeriodInput.value, 10); // 【*** 新增此行 ***】

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
            
            const processedPriceData = processData(priceRawData, rsiPeriod, selectedTimeframe); 

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
                const formattedNews = stockNews.map(news => ({title: news.title,url: news.url
                }));

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
                    rsi_period: rsiPeriod, 
                    latest_volume: processedPriceData.volume[lastIndex]?.toLocaleString() || 'N/A',
                    average_volume: (totalVolume / processedPriceData.volume.length).toLocaleString(undefined, { maximumFractionDigits: 0 }) || 'N/A',
                    insider_trading_summary: insiderTradingSummary,
                    recent_news: formattedNews // <-- 新增的欄位
                };
            } else {
                currentAnalysisData = null;
            }
            
            // 4. 在頁面上顯示結果
            metricsContainer.innerHTML = ''; 
            displayMetrics(processedPriceData);
            displayRsiAlert(processedPriceData);
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
    // --- 計算技術指標 (支援多時間週期動態調整) ---
    // ========================================================================
    function processData(rawData, rsiPeriod, timeframe) {
        const data = {
            date: [], open: [], high: [], low: [], close: [], volume: [],
            ma5: [], ma20: [], ma60: [], // 我們將動態計算這些
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

        // --- 【*** 核心修改點：根據圖表週期，動態決定指標參數 ***】 ---
        let periods = {
            maShort: 5,
            maMedium: 20,
            maLong: 60,
            rsi: rsiPeriod,
            macd: { fast: 12, slow: 26, signal: 9 }
        };

        if (timeframe === '1week') {
            console.log("切換到週線，正在調整指標週期...");
            // 週線：原始週期除以 5 (一週約 5 個交易日)
            periods.maShort = Math.max(Math.round(5 / 5), 1);      // 1 週 MA
            periods.maMedium = Math.max(Math.round(20 / 5), 1);    // 4 週 MA
            periods.maLong = Math.max(Math.round(60 / 5), 1);      // 12 週 MA
            periods.rsi = Math.max(Math.round(rsiPeriod / 5), 2); // RSI 週期至少為 2
            periods.macd = {
                fast: Math.max(Math.round(12 / 5), 1),
                slow: Math.max(Math.round(26 / 5), 1),
                signal: Math.max(Math.round(9 / 5), 1)
            };
        } else if (timeframe === '1month') {
            console.log("切換到月線，正在調整指標週期...");
            // 月線：原始週期除以 21 (一月約 21 個交易日)
            periods.maShort = Math.max(Math.round(5 / 21), 1);
            periods.maMedium = Math.max(Math.round(20 / 21), 1);   // 1 個月 MA
            periods.maLong = Math.max(Math.round(60 / 21), 2);     // 3 個月 MA
            periods.rsi = Math.max(Math.round(rsiPeriod / 21), 2);
            periods.macd = {
                fast: Math.max(Math.round(12 / 21), 1),
                slow: Math.max(Math.round(26 / 21), 2),
                signal: Math.max(Math.round(9 / 21), 1)
            };
        }
        console.log("當前使用的指標週期:", periods);
        
        // --- 使用動態週期參數來計算所有指標 ---
        data.ma5 = calculateMA(data.close, periods.maShort);
        data.ma20 = calculateMA(data.close, periods.maMedium);
        data.ma60 = calculateMA(data.close, periods.maLong);

        const macdData = calculateMACD(data.close, periods.macd.fast, periods.macd.slow, periods.macd.signal);
        data.macdLine = macdData.macdLine;
        data.signalLine = macdData.signalLine;
        data.histogram = macdData.histogram;

        data.rsi = calculateRSI(data.close, periods.rsi);

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

    // --- 計算 RSI (還原至原始穩定版本，並支援動態週期) ---
    function calculateRSI(closePrices, period = 14) {
        let rsi = [];
        // 在陣列開頭先填上 null，數量為 period
        for (let i = 0; i < period; i++) {
            rsi.push(null);
        }

        if (closePrices.length <= period) {
            // 如果數據不足，補滿 null 並返回
            while(rsi.length < closePrices.length) {
                rsi.push(null);
            }
            return rsi;
        }

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
        rsi.push(100 - (100 / (1 + rs)));

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

    // --- 顯示 RSI 超買/超賣警告 ---
    function displayRsiAlert(data) {
        const rsiAlertContainer = document.getElementById('rsi-alert-container');
        // 先清空舊的警告
        rsiAlertContainer.innerHTML = '';

        // 取得最新的 RSI 數值
        const lastIndex = data.rsi.length - 1;
        const latestRsi = data.rsi[lastIndex];

        // 如果沒有有效的 RSI 數值，就直接結束
        if (latestRsi === null || latestRsi === undefined) {
            return;
        }

        let alertHTML = '';
        // 判斷 RSI 數值區間
        if (latestRsi > 70) {
            alertHTML = `
                <div class="rsi-alert rsi-alert-overbought">
                    <span class="rsi-icon">⚠️</span>
                    <div class="rsi-text">
                        <strong>超買警告 (Overbought Warning)</strong>
                        <span>最新 RSI 數值為 ${latestRsi.toFixed(2)}，已進入超買區 (>70)，市場可能過熱，請注意回檔風險。</span>
                    </div>
                </div>
            `;
        } else if (latestRsi < 30) {
            alertHTML = `
                <div class="rsi-alert rsi-alert-oversold">
                    <span class="rsi-icon">💡</span>
                    <div class="rsi-text">
                        <strong>超賣訊號 (Oversold Signal)</strong>
                        <span>最新 RSI 數值為 ${latestRsi.toFixed(2)}，已進入超賣區 (<30)，市場可能過冷，請留意反彈機會。</span>
                    </div>
                </div>
            `;
        }

        // 將產生的警告訊息 HTML 放入容器中
        if (alertHTML) {
            rsiAlertContainer.innerHTML = alertHTML;
        }
    }

    // --- 使用 Plotly.js 繪製圖表 (新增內部人交易聚合功能) ---
    function plotChart(data, insiderTrades, symbol) {
        
        // --- 手動計算 Y 軸顯示範圍 (不變) ---
        const validHighs = data.high.filter(v => v !== null);
        const validLows = data.low.filter(v => v !== null);
        const priceMin = Math.min(...validLows);
        const priceMax = Math.max(...validHighs);
        const padding = (priceMax - priceMin) * 0.05;
        const yAxisRange = [priceMin - padding, priceMax + padding];

        // --- 【*** 核心修改點：聚合內部人交易數據 ***】 ---
        
        // 1. 建立一個聚合器，以日期為 key
        const tradeAggregator = {};
        data.date.forEach((date, index) => {
            tradeAggregator[date] = {
                buyTransactions: 0,
                sellTransactions: 0,
                totalSharesBought: 0,
                totalSharesSold: 0,
                high: data.high[index], // 記下當期的最高價
                low: data.low[index]   // 記下當期的最低價
            };
        });

        // 2. 遍歷每一筆每日交易，將其歸入對應的圖表週期 (週或月)
        insiderTrades.forEach(trade => {
            const tradeDate = new Date(trade.transactionDate);
            // 找到這筆交易屬於哪個圖表週期
            // 我們從後往前找，因為交易通常是近期的
            for (let i = data.date.length - 1; i >= 0; i--) {
                const periodStartDate = new Date(data.date[i]);
                const periodEndDate = (i < data.date.length - 1) ? new Date(data.date[i+1]) : new Date(); // 最後一筆數據的結束日期為今天

                if (tradeDate >= periodStartDate && tradeDate < periodEndDate) {
                    const periodKey = data.date[i];
                    if (trade.transactionType.startsWith('P')) {
                        tradeAggregator[periodKey].buyTransactions++;
                        tradeAggregator[periodKey].totalSharesBought += trade.securitiesTransacted;
                    } else {
                        tradeAggregator[periodKey].sellTransactions++;
                        tradeAggregator[periodKey].totalSharesSold += trade.securitiesTransacted;
                    }
                    break; // 找到對應週期後就跳出內層迴圈
                }
            }
        });
        
        // 3. 根據聚合後的結果，產生圖表標記
        const insiderBuys = { x: [], y: [], text: [] };
        const insiderSells = { x: [], y: [], text: [] };

        for (const date in tradeAggregator) {
            const periodData = tradeAggregator[date];
            if (periodData.buyTransactions > 0) {
                insiderBuys.x.push(date);
                insiderBuys.y.push(periodData.low * 0.98); // 放在 K 棒低點下方一點
                insiderBuys.text.push(`<b>${date} 週期內</b><br>買入筆數: ${periodData.buyTransactions}<br>總計股數: ${periodData.totalSharesBought.toLocaleString()}`);
            }
            if (periodData.sellTransactions > 0) {
                insiderSells.x.push(date);
                insiderSells.y.push(periodData.high * 1.02); // 放在 K 棒高點上方一點
                insiderSells.text.push(`<b>${date} 週期內</b><br>賣出筆數: ${periodData.sellTransactions}<br>總計股數: ${periodData.totalSharesSold.toLocaleString()}`);
            }
        }

        const traceInsiderBuys = { x: insiderBuys.x, y: insiderBuys.y, text: insiderBuys.text, mode: 'markers', type: 'scatter', name: '內部人買入', hoverinfo: 'text', marker: { symbol: 'triangle-up', color: 'green', size: 10, line: { color: 'black', width: 1 } }, yaxis: 'y1' };
        const traceInsiderSells = { x: insiderSells.x, y: insiderSells.y, text: insiderSells.text, mode: 'markers', type: 'scatter', name: '內部人賣出', hoverinfo: 'text', marker: { symbol: 'triangle-down', color: 'red', size: 10, line: { color: 'black', width: 1 } }, yaxis: 'y1' };


        // --- 定義所有圖表軌跡 (Traces) (下方不變) ---
        const traceCandlestick = { x: data.date, open: data.open, high: data.high, low: data.low, close: data.close, type: 'candlestick', name: 'K線', yaxis: 'y1' };
        const traceMa5 = { x: data.date, y: data.ma5, type: 'scatter', mode: 'lines', name: 'MA5', line: { color: 'blue', width: 1.5 }, yaxis: 'y1' };
        const traceMa20 = { x: data.date, y: data.ma20, type: 'scatter', mode: 'lines', name: 'MA20', line: { color: 'green', width: 1.5 }, yaxis: 'y1' };
        const traceMa60 = { x: data.date, y: data.ma60, type: 'scatter', mode: 'lines', name: 'MA60', line: { color: 'purple', width: 1.5 }, yaxis: 'y1' };
        const traceRsi = { x: data.date, y: data.rsi, type: 'scatter', mode: 'lines', name: 'RSI', line: { color: '#3498db' }, yaxis: 'y2' };
        const traceMacdLine = { x: data.date, y: data.macdLine, type: 'scatter', mode: 'lines', name: 'MACD', line: { color: '#e67e22' }, yaxis: 'y3' };
        const traceSignalLine = { x: data.date, y: data.signalLine, type: 'scatter', mode: 'lines', name: 'Signal', line: { color: '#3498db' }, yaxis: 'y3' };
        const traceHistogram = { x: data.date, y: data.histogram, type: 'bar', name: 'Histogram', marker: { color: data.histogram.map(val => { if (val === null) { return 'rgba(0, 0, 0, 0)'; } return val > 0 ? 'rgba(239, 83, 80, 0.7)' : 'rgba(38, 166, 154, 0.7)'; }) }, yaxis: 'y3' };
        const traceVolume = { x: data.date, y: data.volume, type: 'bar', name: '成交量', marker: { color: 'rgba(128,128,128,0.5)' }, yaxis: 'y4' };

        // --- 圖表佈局設定 (Layout) (不變) ---
        const layout = { title: `${symbol} 股價 K 線圖與技術指標`, height: 950, xaxis: { rangeslider: { visible: false } }, yaxis: { domain: [0.55, 1], range: yAxisRange }, yaxis2: { domain: [0.38, 0.52], title: 'RSI' }, yaxis3: { domain: [0.18, 0.35], title: 'MACD' }, yaxis4: { domain: [0, 0.15], title: '成交量' }, legend: { traceorder: 'normal' }, margin: { r: 150 }, showlegend: true, shapes: [ { type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y2', y0: 70, y1: 70, line: { color: 'red', width: 1, dash: 'dash' } }, { type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y2', y0: 30, y1: 30, line: { color: 'red', width: 1, dash: 'dash' } }, { type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y2', y0: 70, y1: 100, fillcolor: 'rgba(239, 83, 80, 0.1)', layer: 'below', line: { width: 0 } }, { type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y2', y0: 0, y1: 30, fillcolor: 'rgba(38, 166, 154, 0.1)', layer: 'below', line: { width: 0 } } ] };

        // --- 組合所有圖表數據 (不變) ---
        const plotData = [ traceCandlestick, traceMa5, traceMa20, traceMa60, traceRsi, traceMacdLine, traceSignalLine, traceHistogram, traceVolume, traceInsiderBuys, traceInsiderSells ];
        
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
                    ${imageHTML}
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
            n8nButton.textContent = '🤖 執行 AI 分析';
        }
    }

    // ========================================================================
    // --- 【全新功能】策略篩選器 ---
    // ========================================================================

    /** * 從 FMP API 獲取所有產業分類列表
     * @param {string} apiKey - 你的 FMP API 金鑰
     * @returns {Promise<Array>} - 回傳產業列表 */
    async function fetchAllSectors(apiKey) {
        const url = `https://financialmodelingprep.com/api/v3/sector-performance?apikey=${apiKey}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('無法獲取產業列表。');
        }
        const data = await response.json();
        // 直接回傳所有 FMP 提供的產業，不再進行過濾
        return data;
    }

    /** * 從 FMP API 獲取指定股票的布林通道數據
     * @param {string} symbol - 股票代碼
     * @param {string} apiKey - 你的 FMP API 金鑰
     * @returns {Promise<Array>} - 回傳布林通道數據陣列 */
    async function fetchBollingerBands(symbol, apiKey) {
        // 標準差為2，週期為20天是 BBands 的常用設定
        const url = `https://financialmodelingprep.com/api/v3/technical_indicator/daily/${symbol}?period=20&stdDev=2&type=bollinger&apikey=${apiKey}`;
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`無法獲取 ${symbol} 的布林通道數據。`);
            return null; // 回傳 null 以便後續處理
        }
        return await response.json();
    }

    /** * 從 FMP API 的股票篩選器獲取結果
     * @param {string} sector - 要篩選的產業別
     * @param {string} apiKey - 你的 FMP API 金鑰
     * @returns {Promise<Array>} - 回傳股票列表 */
    async function fetchScreenerResults(sector, apiKey) {
        // FMP 篩選器 API：根據產業篩選，並依照成交量降冪排序，回傳前 10 筆
        const url = `https://financialmodelingprep.com/api/v3/stock-screener?sector=${sector}&volumeMoreThan=1000000&isEtf=false&isActivelyTrading=true&sortBy=volume&sortOrder=desc&limit=10&apikey=${apiKey}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`無法獲取 ${sector} 產業的篩選結果。`);
        }
        return await response.json();
    }

    /*** 【全新】從 FMP 篩選器獲取各產業的「優質股」(依市值排序) - 修正版
     * @param {string} sector - 要篩選的產業別
     * @param {string} apiKey - 你的 FMP API 金鑰
     * @returns {Promise<Array>} - 回傳股票列表*/
    async function fetchQualityScreenerResults(sector, apiKey) {
        // 【*** 修改點：移除了 &peMoreThan=0 這個條件 ***】
        // 篩選條件：成交量>50萬、依市值降冪排序
        const url = `https://financialmodelingprep.com/api/v3/stock-screener?sector=${sector}&volumeMoreThan=500000&isEtf=false&isActivelyTrading=true&sortBy=marketCap&sortOrder=desc&limit=10&apikey=${apiKey}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`無法獲取 ${sector} 產業的優質股。`);
            return []; // 返回空陣列以免中斷流程
        }
        return await response.json();
    }

    /*** 「反轉機會篩選器」的主要執行函式 */
    async function runScreener() {
        console.log("🚀 開始執行反轉機會篩選器...");
        const apiKey = fmpKeyInput.value.trim();
        if (!apiKey) {
            alert('zEmap5KigsQdS8290WKQ3hnAuG96PaNn');
            return;
        }

        // --- 階段 1: 市場掃描 (與之前相同) ---
        welcomeMessage.classList.add('hidden');
        resultsContainer.classList.add('hidden');
        loader.classList.remove('hidden');
        
        let allCandidateStocks = [];
        try {
            const sectors = await fetchAllSectors(apiKey);
            console.log(`🌍 市場上共有 ${sectors.length} 個主要產業分類。`);
            
            let sectorCount = 0;
            for (const sector of sectors) {
                sectorCount++;
                welcomeMessage.classList.remove('hidden');
                welcomeMessage.innerHTML = `<h1>正在掃描市場...</h1><p>(${sectorCount}/${sectors.length}) 正在分析 ${sector.sector} 產業</p>`;
                const top10Stocks = await fetchScreenerResults(sector.sector, apiKey);
                allCandidateStocks = allCandidateStocks.concat(top10Stocks);
            }
            console.log(`✅ 市場掃描完成，共 ${allCandidateStocks.length} 檔候選股。`);

        } catch (error) {
            welcomeMessage.classList.remove('hidden');
            welcomeMessage.innerHTML = `<h1>❌ 篩選時發生錯誤</h1><p>${error.message}</p>`;
            console.error('篩選器執行錯誤:', error);
            loader.classList.add('hidden');
            return;
        }

        // --- 階段 2: 深度條件過濾 ---
        console.log("🕵️‍♂️ 開始對候選股進行深度條件過濾...");
        const finalResults = []; // 存放通過所有考驗的股票
        
        let stockCount = 0;
        for (const stock of allCandidateStocks) {
            stockCount++;
            const symbol = stock.symbol;
            console.log(`(${stockCount}/${allCandidateStocks.length}) 正在檢驗 ${symbol}...`);
            welcomeMessage.innerHTML = `<h1>正在過濾候選股...</h1><p>(${stockCount}/${allCandidateStocks.length}) 正在檢驗 ${symbol}</p>`;

            try {
                // --- API 請求 1: 獲取近一個月的歷史數據 (用於計算趨勢, RSI, 成交量) ---
                const oneMonthAgo = new Date();
                oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
                const history = await fetchStockData(symbol, oneMonthAgo.toISOString().split('T')[0], new Date().toISOString().split('T')[0], apiKey, '1day');
                if (!history || history.length < 20) {
                    console.log(`- ${symbol}: 歷史數據不足，跳過。`);
                    continue; // 數據不足則跳過
                }

                // --- 條件 1: 檢查近一週是否下跌 ---
                const last5days = history.slice(-5);
                const isDownTrend = last5days[last5days.length - 1].close < last5days[0].close;
                if (!isDownTrend) {
                    console.log(`- ${symbol}: 未滿足 '一週下跌' 條件，跳過。`);
                    continue;
                }

                // --- 條件 2: 檢查 RSI 是否 < 30 ---
                const closes = history.map(d => d.close);
                const rsiResult = calculateRSI(closes, 14);
                const latestRsi = rsiResult[rsiResult.length - 1];
                if (latestRsi === null || latestRsi >= 30) {
                    console.log(`- ${symbol}: RSI (${latestRsi?.toFixed(2)}) 未滿足 '< 30' 條件，跳過。`);
                    continue;
                }

                // --- 新增條件 1: 檢查成交量是否放大 ---
                const volumes = history.map(d => d.volume);
                const latestVolume = volumes[volumes.length - 1];
                const avgVolume20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
                if (latestVolume < avgVolume20 * 1.5) {
                    console.log(`- ${symbol}: 未滿足 '成交量放大' 條件，跳過。`);
                    continue;
                }
                
                // --- API 請求 2: 獲取布林通道數據 ---
                const bbands = await fetchBollingerBands(symbol, apiKey);
                if (!bbands || bbands.length === 0) { continue; }
                const latestClose = closes[closes.length - 1];
                const latestLowerBand = bbands[0].lowerBand; // API回傳的是倒序，第一筆就是最新的

                // --- 新增條件 2: 檢查股價是否跌破布林下軌 ---
                if (latestClose > latestLowerBand) {
                    console.log(`- ${symbol}: 股價 (${latestClose}) 未滿足 '跌破布林下軌' (${latestLowerBand}) 條件，跳過。`);
                    continue;
                }

                // --- API 請求 3: 獲取內部人交易數據 ---
                const insiderTrades = await fetchInsiderTrades(symbol, apiKey);
                const recentBuys = insiderTrades.filter(t => t.transactionType.startsWith('P-Purchase'));
                const buyingDays = new Set(recentBuys.map(t => t.transactionDate)).size;

                // --- 條件 3: 檢查內部人購買天數是否 > 3 ---
                if (buyingDays <= 3) {
                    console.log(`- ${symbol}: 內部人購買天數 (${buyingDays}) 未滿足 '> 3' 條件，跳過。`);
                    continue;
                }

                // 🎉 如果所有條件都通過，這就是我們要找的股票！
                console.log(`%c✅ ${symbol} 通過了所有篩選條件!`, "color: green; font-weight: bold;");
                finalResults.push({
                    symbol: symbol,
                    companyName: stock.companyName,
                    price: stock.price,
                    rsi: latestRsi,
                    volumeRatio: latestVolume / avgVolume20,
                    bollinger: { close: latestClose, lowerBand: latestLowerBand },
                    insiderBuyingDays: buyingDays
                });

            } catch (err) {
                console.error(`檢驗 ${symbol} 時發生錯誤:`, err.message);
            }
        }

        // --- 階段 3: 顯示最終結果並觸發 AI 分析 ---
        console.log("🌟🌟🌟 最終篩選結果:", finalResults);
        loader.classList.add('hidden'); // 先隱藏載入動畫

        if (finalResults.length > 0) {
            // 如果有結果，就呼叫新的 AI 分析函式
            analyzeScreenerResultsWithAI(finalResults, apiKey);
        } else {
            // 如果沒有結果，就顯示找不到的訊息
            welcomeMessage.innerHTML = `<h1>篩選完畢！</h1><p>在 ${allCandidateStocks.length} 檔候選股中，沒有找到完全符合所有條件的股票。</p>`;
        }
    }

    /*** 【全新功能】將篩選器結果發送給 AI 進行分析並顯示
     * @param {Array} results - 通過所有篩選的股票陣列
     * @param {string} apiKey - 你的 FMP API 金鑰 */
    async function analyzeScreenerResultsWithAI(results, apiKey) {
        if (!results || results.length === 0) return;

        console.log("🧠 正在為篩選結果準備 AI 分析...");
        welcomeMessage.innerHTML = `<h1>正在為 ${results.length} 檔潛力股請求 AI 分析...</h1><p>這個過程可能需要一點時間，請稍候。</p>`;
        loader.classList.remove('hidden');

        try {
            // 1. 為所有結果股票並行獲取新聞
            const newsPromises = results.map(stock => fetchStockNews(stock.symbol, apiKey));
            const newsResults = await Promise.all(newsPromises);

            // 2. 將新聞數據合併到結果中
            const payload = results.map((stock, index) => {
                const formattedNews = newsResults[index].map(news => ({
                    title: news.title,
                    url: news.url
                }));
                return {
                    ...stock,
                    recent_news: formattedNews
                };
            });
            
            console.log("📦 最終打包發送給 AI 的數據:", payload);

            // 3. 呼叫新的 Screener Webhook URL
            const response = await fetch(N8N_SCREENER_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Screener AI 分析 Webhook 回應錯誤，狀態碼: ${response.status}`);
            }

            const aiResult = await response.json();
            
            // 4. 將 AI 的分析結果顯示在新的容器中
            const screenerResultsContainer = document.getElementById('screener-results-container');
            if (aiResult.aiAnalysisText) {
                const htmlContent = marked.parse(aiResult.aiAnalysisText);
                screenerResultsContainer.innerHTML = `<div class="card">${htmlContent}</div>`;
                welcomeMessage.classList.add('hidden'); // 隱藏提示訊息
            } else {
                throw new Error('AI 回應中找不到 "aiAnalysisText" 欄位。');
            }

        } catch (error) {
            welcomeMessage.innerHTML = `<h1>❌ AI 分析時發生錯誤</h1><p>${error.message}</p>`;
            console.error('Screener AI 分析錯誤:', error);
        } finally {
            loader.classList.add('hidden');
        }
    }

    /*** 【全新策略】「主力追蹤策略」篩選器*/
    async function runInsiderScreener() {
        console.log("🚀 開始執行『主力追蹤策略』篩選器...");
        const apiKey = fmpKeyInput.value.trim();
        if (!apiKey) {
            alert('請先提供 FMP API 金鑰。');
            return;
        }

        // --- 階段 1: 市場掃描 ---
        welcomeMessage.classList.add('hidden');
        resultsContainer.classList.add('hidden');
        loader.classList.remove('hidden');
        
        let allCandidateStocks = [];
        try {
            const sectors = await fetchAllSectors(apiKey);
            let sectorCount = 0;
            for (const sector of sectors) {
                sectorCount++;
                welcomeMessage.classList.remove('hidden');
                welcomeMessage.innerHTML = `<h1>正在掃描市場...</h1><p>(${sectorCount}/${sectors.length}) 正在分析 ${sector.sector} 產業</p>`;
                const top10Stocks = await fetchScreenerResults(sector.sector, apiKey);
                allCandidateStocks = allCandidateStocks.concat(top10Stocks);
            }
        } catch (error) {
            // ... (錯誤處理與之前相同)
            welcomeMessage.innerHTML = `<h1>❌ 篩選時發生錯誤</h1><p>${error.message}</p>`;
            console.error('篩選器執行錯誤:', error);
            loader.classList.add('hidden');
            return;
        }

        // --- 階段 2: 核心條件過濾 ---
        console.log(`🕵️‍♂️ 市場掃描完成，共 ${allCandidateStocks.length} 檔候選股。開始進行核心條件過濾...`);
        const finalResults = [];
        
        let stockCount = 0;
        for (const stock of allCandidateStocks) {
            stockCount++;
            const symbol = stock.symbol;
            welcomeMessage.innerHTML = `<h1>正在過濾候選股...</h1><p>(${stockCount}/${allCandidateStocks.length}) 正在檢驗 ${symbol}</p>`;

            try {
                // --- API 請求: 獲取近三個月的歷史數據 (計算 MA50 需要較長數據) ---
                const threeMonthsAgo = new Date();
                threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90);
                const history = await fetchStockData(symbol, threeMonthsAgo.toISOString().split('T')[0], new Date().toISOString().split('T')[0], apiKey, '1day');
                if (!history || history.length < 50) { continue; } // MA50 需要至少 50 天數據

                // --- 條件 1: 檢查成交量是否放大 ---
                const volumes = history.map(d => d.volume);
                const latestVolume = volumes[volumes.length - 1];
                const avgVolume20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
                if (latestVolume < avgVolume20 * 1.5) { continue; }
                
                // --- 條件 2: 檢查一週內是否有 3 天內部人買入 ---
                const insiderTrades = await fetchInsiderTrades(symbol, apiKey);
                const oneWeekAgo = new Date();
                oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

                const recentBuys = insiderTrades.filter(t => 
                    t.transactionType.startsWith('P-Purchase') && 
                    new Date(t.transactionDate) >= oneWeekAgo
                );
                const buyingDays = new Set(recentBuys.map(t => t.transactionDate)).size;
                if (buyingDays < 3) { continue; }

                // --- 新增條件: 判斷趨勢方向 (MA50) ---
                const closes = history.map(d => d.close);
                const ma50 = calculateMA(closes, 50);
                const latestClose = closes[closes.length - 1];
                const latestMa50 = ma50[ma50.length - 1];
                
                let trendType = "不明確";
                if (latestClose > latestMa50) {
                    trendType = "順勢加碼 (Continuation)";
                } else {
                    trendType = "逆勢抄底 (Reversal)";
                }

                // 🎉 如果所有條件都通過，這就是我們要找的股票！
                console.log(`%c✅ ${symbol} 通過了『主力追蹤策略』篩選!`, "color: purple; font-weight: bold;");
                finalResults.push({
                    symbol: symbol,
                    companyName: stock.companyName,
                    price: stock.price,
                    volumeRatio: latestVolume / avgVolume20,
                    insiderBuyingDays: buyingDays,
                    trendType: trendType // 將趨勢類型加入結果
                });

            } catch (err) {
                console.error(`檢驗 ${symbol} 時發生錯誤:`, err.message);
            }
        }

        // --- 階段 3: 顯示最終結果 ---
        console.log("🌟🌟🌟 主力追蹤策略 最終篩選結果:", finalResults);
        loader.classList.add('hidden');
        welcomeMessage.innerHTML = `<h1>主力追蹤策略 篩選完畢！</h1><p>在 ${allCandidateStocks.length} 檔候選股中，共找到 ${finalResults.length} 檔符合條件的股票！請查看主控台。</p>`;
    }

    /*** 【全新】載入並填滿「優質股」下拉選單*/
    async function populateQualityStocksDropdown() {
        const apiKey = fmpKeyInput.value.trim();
        const dropdown = document.getElementById('quality-stocks-dropdown');

        if (!apiKey) {
            dropdown.innerHTML = '<option value="" disabled selected>請先輸入API Key</option>';
            return;
        }

        try {
            const sectors = await fetchAllSectors(apiKey);
            // 清空「載入中...」的提示
            dropdown.innerHTML = '<option value="" disabled selected>選擇熱門股...</option>';

            for (const sector of sectors) {
                // 為每個產業建立一個選項群組
                const optgroup = document.createElement('optgroup');
                optgroup.label = sector.sector;

                const qualityStocks = await fetchQualityScreenerResults(sector.sector, apiKey);
                
                qualityStocks.forEach(stock => {
                    const option = document.createElement('option');
                    option.value = stock.symbol;
                    option.textContent = `${stock.symbol} (${stock.companyName})`;
                    optgroup.appendChild(option);
                });

                dropdown.appendChild(optgroup);
            }
        } catch (error) {
            console.error("載入優質股下拉選單失敗:", error);
            dropdown.innerHTML = '<option value="" disabled selected>載入失敗</option>';
        }
    }

    // --- 【*** 新增監聽與呼叫 ***】 ---
    // 監聽下拉選單的變動
    const qualityStocksDropdown = document.getElementById('quality-stocks-dropdown');
    qualityStocksDropdown.addEventListener('change', (event) => {
        const selectedSymbol = event.target.value;
        if (selectedSymbol) {
            symbolInput.value = selectedSymbol; // 將選中的股票代碼填入輸入框
            runAnalysis(); // 自動執行分析
        }
    });

    // 頁面載入後，自動執行填滿下拉選單的功能
    populateQualityStocksDropdown();

});
