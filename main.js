/**
 * Налаштування підключення згідно з ТЗ [cite: 38]
 */
const WS_URL = "ws://localhost:4001";
const API_URL = "http://localhost:4001/config";

const statusLabel = document.getElementById('wsStatus');
const dataLog = document.getElementById('dataLog');
const sendBtn = document.getElementById('sendConfig');

let satellitesMap = new Map();
let chart;
let socket = null;

/**
 * Ініціалізація графіка Chart.js у декартових координатах [cite: 3, 43]
 */
function initChart() {
    const ctx = document.getElementById('gpsChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                { label: 'Супутники', data: [], backgroundColor: 'blue', pointRadius: 6 },
                { label: 'Аналітичний метод', data: [], backgroundColor: 'red', pointRadius: 9, pointStyle: 'rectRot' },
                { label: 'Чисельний метод', data: [], backgroundColor: 'green', pointRadius: 9, pointStyle: 'triangle' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { min: 0, max: 200, title: { display: true, text: 'X (км)' } },
                y: { min: 0, max: 200, title: { display: true, text: 'Y (км)' } }
            },
            animation: false
        }
    });
}

/**
 * Аналітичний метод: пряме розв'язання системи рівнянь [cite: 6]
 */
function solveAnalytical(pts) {
    if (pts.length < 3) return null;
    const [p1, p2, p3] = pts;

    // Формування матриці для лінеаризованої системи
    const A = [[2*(p2.x-p1.x), 2*(p2.y-p1.y)], [2*(p3.x-p1.x), 2*(p3.y-p1.y)]];
    const B = [
        p1.d**2 - p2.d**2 - p1.x**2 + p2.x**2 - p1.y**2 + p2.y**2,
        p1.d**2 - p3.d**2 - p1.x**2 + p3.x**2 - p1.y**2 + p3.y**2
    ];

    const det = A[0][0]*A[1][1] - A[0][1]*A[1][0];
    if (Math.abs(det) < 0.1) return null;

    return {
        x: (B[0] * A[1][1] - B[1] * A[0][1]) / det,
        y: (A[0][0] * B[1] - A[1][0] * B[0]) / det
    };
}

/**
 * Чисельний метод: пошук точки, що мінімізує похибку [cite: 8]
 */
function solveNumerical(pts) {
    if (pts.length < 3) return null;
    let x = 100, y = 100; // Початкове наближення
    const learningRate = 0.1;

    for (let i = 0; i < 50; i++) {
        let gx = 0, gy = 0;
        pts.forEach(p => {
            const curDist = Math.sqrt((x - p.x)**2 + (y - p.y)**2);
            const error = curDist - p.d;
            gx += error * (x - p.x) / (curDist || 1);
            gy += error * (y - p.y) / (curDist || 1);
        });
        x -= learningRate * gx;
        y -= learningRate * gy;
    }
    return { x, y };
}

/**
 * Підключення до WebSocket емулятора [cite: 38]
 */
function connect() {
    if (socket) socket.close();
    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
        statusLabel.innerText = "Підключено";
        statusLabel.className = "status-on";
        log("З'єднання встановлено.");
    };

    socket.onmessage = (event) => {
        const raw = JSON.parse(event.data);
        // Розрахунок відстані на основі затримки сигналу [cite: 34, 35]
        const distance = (raw.receivedAt - raw.sentAt) * 0.1;

        satellitesMap.set(raw.id, { x: raw.x, y: raw.y, d: distance, lastSeen: Date.now() });

        // Очищення застарілих даних
        const now = Date.now();
        for (let [id, p] of satellitesMap) {
            if (now - p.lastSeen > 5000) satellitesMap.delete(id);
        }

        const pts = Array.from(satellitesMap.values());
        chart.data.datasets[0].data = pts.map(p => ({ x: p.x, y: p.y }));

        if (pts.length >= 3) {
            const ana = solveAnalytical(pts);
            const num = solveNumerical(pts);
            chart.data.datasets[1].data = ana ? [ana] : [];
            chart.data.datasets[2].data = num ? [num] : [];
        }
        chart.update();
    };

    socket.onclose = () => {
        statusLabel.innerText = "Відключено";
        statusLabel.className = "status-off";
        setTimeout(connect, 3000); // Авто-реконект [cite: 138]
    };
}

/**
 * Оновлення параметрів через POST запит [cite: 25, 39]
 */
sendBtn.onclick = async () => {
    const config = {
        satelliteSpeed: Number(document.getElementById('satelliteSpeed').value),
        objectSpeed: Number(document.getElementById('objectSpeed').value)
    };

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        if (res.ok) {
            log("Параметри оновлено. Перезапуск...");
            satellitesMap.clear();
            if (socket) socket.close();
        }
    } catch (e) {
        log("Помилка API.");
    }
};

function log(msg) {
    const d = document.createElement('div');
    d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    dataLog.prepend(d);
}

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    connect();
});