const http = require('http');
const { execSync } = require('child_process');

// Get devtools tab
function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function evaluate(wsUrl, expr) {
    return new Promise((resolve) => {
        const WebSocket = require('ws');
        const ws = new WebSocket(wsUrl);
        ws.on('open', () => {
            ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
        });
        ws.on('message', (data) => {
            const r = JSON.parse(data);
            if (r.id === 1) {
                resolve(r.result);
                ws.close();
            }
        });
        ws.on('error', e => resolve({ error: e.message }));
    });
}

(async () => {
    try {
        const tabs = await getJson('http://127.0.0.1:9222/json');
        const appTab = tabs.find(t => t.url && t.url.includes('index.html'));
        if (!appTab) { console.log('App tab not found. Tabs:', tabs.map(t=>t.url)); return; }
        
        console.log('Tab found:', appTab.url);
        const wsUrl = appTab.webSocketDebuggerUrl;
        
        const checks = [
            ["require available?", "typeof window.require"],
            ["ipcRenderer?", "try{const {ipcRenderer}=window.require('electron'); 'ipc OK'}catch(e){'ERROR: '+e.message}"],
            ["btn-load exists?", "document.getElementById('btn-load') ? 'found' : 'NOT FOUND'"],
            ["THREE loaded?", "typeof THREE !== 'undefined' ? 'THREE OK' : 'THREE MISSING'"],
            ["processFileLoad?", "typeof processFileLoad === 'function' ? 'fn OK' : 'fn MISSING'"],
            ["Console errors", "window.__errors || 'no errors captured'"],
        ];
        
        for (const [name, expr] of checks) {
            const r = await evaluate(wsUrl, expr);
            console.log(`${name}: ${JSON.stringify(r?.result?.value || r?.result?.description || r)}`);
        }
    } catch(e) {
        console.error('Error:', e.message);
    }
})();
