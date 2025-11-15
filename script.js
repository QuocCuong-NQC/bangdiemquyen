import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, remove } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// Global variables provided by Canvas environment
const canvasAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-form-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Use environment configuration first, fall back to user-provided config
let firebaseConfig = null;
try {
    firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
} catch (e) {
    console.error("Lỗi: Không thể phân tích __firebase_config từ môi trường.", e);
}

// FALLBACK: Sử dụng cấu hình cứng nếu không có biến môi trường (KHÔNG KHUYẾN NGHỊ)
if (!firebaseConfig) {
    console.warn("Sử dụng cấu hình Firebase cứng làm dự phòng. Vui lòng kiểm tra biến môi trường.");
    firebaseConfig = {
        apiKey: "AIzaSyAW-BmQiehXNaAixtRdTfa1JLNRnChBhFo",
        authDomain: "vovinamquyen-f6e9c.firebaseapp.com",
        projectId: "vovinamquyen-f6e9c",
        storageBucket: "vovinamquyen-f6e9c.firebasestorage.app",
        messagingSenderId: "287898612930",
        appId: "1:287898612930:web:e508842d27a3ce8e53775b",
        measurementId: "G-X0HFDM72YG"
    };
}

// ----------------------------------------------------
// KHỞI TẠO FIREBASE VÀ CÁC THAM CHIẾU
// ----------------------------------------------------
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Các đường dẫn (Refs) đến Realtime Database: Public/data
// poomsaeMatch: Lưu trạng thái chung (tên VĐV, tên bài, tổng điểm cuối cùng)
const formMatchRef = ref(db, `artifacts/${canvasAppId}/public/data/poomsaeMatch`);
// poomsaeVotes: Lưu điểm tạm thời của 3 giám định
const formJudgeVotesRef = ref(db, `artifacts/${canvasAppId}/public/data/poomsaeVotes`);

// STATE CỤC BỘ
let state = {
    eventTitle: 'GIẢI IPES MỞ RỘNG NĂM 2025',
    formName: 'Khởi Quyền',
    athleteName: 'NGUYỄN VĂN A',
    gd1Score: 0.00,
    gd2Score: 0.00,
    gd3Score: 0.00,
    totalScore: 0.00
};

// DOM ELEMENTS
const displayElements = {
    eventTitle: document.getElementById('eventTitle'),
    formNameDisplay: document.getElementById('formNameDisplay'),
    athleteNameDisplay: document.getElementById('athleteNameDisplay'),
    totalScoreDisplay: document.getElementById('totalScoreDisplay'),
    gd1ScoreDisplay: document.getElementById('gd1ScoreDisplay'),
    gd2ScoreDisplay: document.getElementById('gd2ScoreDisplay'),
    gd3ScoreDisplay: document.getElementById('gd3ScoreDisplay'),
    tournamentNameInput: document.getElementById('tournamentName'),
    athleteNameInput: document.getElementById('athleteNameInput'),
    gd1Input: document.getElementById('gd1Input'),
    gd2Input: document.getElementById('gd2Input'),
    gd3Input: document.getElementById('gd3Input'),
    btnKhoiQuyen: document.getElementById('btnKhoiQuyen'),
    btnThapTuQuyen: document.getElementById('btnThapTuQuyen'),
    btnReset: document.getElementById('btnReset'),
    judgeButtons: document.querySelectorAll('[data-judge]'),
    btnFullscreenControl: document.getElementById('btnFullscreenControl')
};

// ----------------------------------------------------
// UI & UTILITY FUNCTIONS
// ----------------------------------------------------

/** Định dạng điểm thành chuỗi có 2 chữ số thập phân */
function formatScore(score) {
    // Math.round(score * 100) / 100 để tránh lỗi dấu phẩy động
    return (Math.round(score * 100) / 100).toFixed(2);
}

/** Cập nhật giao diện dựa trên trạng thái (state) cục bộ */
function updateDisplay() {
    displayElements.gd1ScoreDisplay.innerText = formatScore(state.gd1Score);
    displayElements.gd2ScoreDisplay.innerText = formatScore(state.gd2Score);
    displayElements.gd3ScoreDisplay.innerText = formatScore(state.gd3Score);
    displayElements.totalScoreDisplay.innerText = formatScore(state.totalScore);
    
    displayElements.eventTitle.innerText = state.eventTitle || 'TÊN GIẢI CHƯA CÓ';
    displayElements.formNameDisplay.innerText = `Nội Dung: ${state.formName}`;
    displayElements.athleteNameDisplay.innerText = state.athleteName || 'VẬN ĐỘNG VIÊN';
    
    // Đồng bộ trạng thái nút bấm
    [displayElements.btnKhoiQuyen, displayElements.btnThapTuQuyen].forEach(btn => {
        if (btn.getAttribute('data-form') === state.formName) {
            btn.classList.add('bg-green-600');
            btn.classList.remove('bg-gray-500');
        } else {
            btn.classList.add('bg-gray-500');
            btn.classList.remove('bg-green-600');
        }
    });
}

/** Hiển thị thông báo nhanh */
function flashMessage(txt) {
    const el = document.createElement('div'); el.style.position='fixed'; el.style.left='50%'; el.style.top='18px'; el.style.transform='translateX(-50%)'; el.style.background='linear-gradient(90deg, #10B981, #059669)'; el.style.padding='10px 14px'; el.style.borderRadius='10px'; el.style.boxShadow='0 12px 40px rgba(0,0,0,0.6)'; el.style.zIndex=9999; el.style.color='#fff'; el.style.opacity='0'; el.style.transition='opacity .16s ease'; el.innerText = txt; document.body.appendChild(el); requestAnimationFrame(()=>el.style.opacity=1); setTimeout(()=>{ el.style.opacity=0; setTimeout(()=>el.remove(),300); },1600);
}

// ----------------------------------------------------
// FIREBASE ACTION FUNCTIONS
// ----------------------------------------------------

/** Cập nhật một khóa duy nhất trong match state */
async function setMatchKey(key, val) {
    try {
        await set(ref(db, `artifacts/${canvasAppId}/public/data/poomsaeMatch/${key}`), val);
    } catch(e) {
        console.error("Lỗi cập nhật match key:", e);
    }
}

/** Giám định nhập điểm và bấm nút gửi */
async function submitJudgeScore(judgeId) {
    const inputEl = displayElements[`gd${judgeId}Input`];
    let score = parseFloat(inputEl.value);

    // 1. Validate điểm (7.90 - 9.00)
    if (isNaN(score) || score < 7.90 || score > 9.00) {
        flashMessage(`Điểm GĐ${judgeId} không hợp lệ. (7.90 - 9.00)`);
        return;
    }
    
    // 2. Format điểm về 2 chữ số thập phân
    score = Math.round(score * 100) / 100;
    
    // 3. Gửi điểm lên node Votes (tạm thời)
    const voteData = {
        score: score,
        timestamp: Date.now()
    };
    
    try {
        // Ghi đè điểm mới nhất của Giám định này
        await set(ref(db, `artifacts/${canvasAppId}/public/data/poomsaeVotes/gd${judgeId}`), voteData);
        flashMessage(`GĐ${judgeId} đã gửi điểm: ${formatScore(score)}`);
    } catch (e) {
        console.error("Lỗi gửi điểm GĐ:", e);
        flashMessage(`Lỗi gửi điểm GĐ${judgeId}.`);
    }
}

/** Reset toàn bộ điểm (match state và votes) */
async function resetForm() {
    if (!confirm('Xác nhận reset toàn bộ điểm và thông tin?')) return;
    try {
        // 1. Reset trạng thái chính
        await set(formMatchRef, {
            eventTitle: state.eventTitle,
            formName: state.formName,
            athleteName: state.athleteName,
            gd1Score: 0.00,
            gd2Score: 0.00,
            gd3Score: 0.00,
            totalScore: 0.00
        });
        // 2. Xóa tất cả Votes tạm thời
        await remove(formJudgeVotesRef);
        flashMessage("Đã reset điểm Quyền về 0.00.");
    } catch(e) {
        console.error("Lỗi reset:", e);
    }
}

// ----------------------------------------------------
// FIREBASE LISTENERS (Đồng bộ Real-time)
// ----------------------------------------------------

/** Listener 1: Đồng bộ trạng thái chính (Score, Title, Name) */
onValue(formMatchRef, (snapshot) => {
    const data = snapshot.val() || {};
    
    state.eventTitle = data.eventTitle || displayElements.tournamentNameInput.value;
    state.formName = data.formName || 'Khởi Quyền';
    state.athleteName = data.athleteName || displayElements.athleteNameInput.value;
    state.gd1Score = data.gd1Score || 0.00;
    state.gd2Score = data.gd2Score || 0.00;
    state.gd3Score = data.gd3Score || 0.00;
    state.totalScore = data.totalScore || 0.00;
    
    // Đồng bộ inputs Admin
    displayElements.tournamentNameInput.value = state.eventTitle;
    displayElements.athleteNameInput.value = state.athleteName;
    
    updateDisplay();
});

/** Listener 2: Xử lý Votes từ Giám định và Cập nhật Tổng điểm (Atomic Update) */
onValue(formJudgeVotesRef, (snapshot) => {
    const votes = snapshot.val() || {};
    let scoreUpdate = {};
    
    // Lấy điểm từ votes hoặc điểm hiện tại trong state (nếu chưa có vote mới)
    const gd1 = votes.gd1 ? votes.gd1.score : state.gd1Score;
    const gd2 = votes.gd2 ? votes.gd2.score : state.gd2Score;
    const gd3 = votes.gd3 ? votes.gd3.score : state.gd3Score;
    
    // Tính tổng điểm
    const total = gd1 + gd2 + gd3;
    
    // Chỉ cập nhật nếu có sự khác biệt
    if (gd1 !== state.gd1Score) scoreUpdate.gd1Score = gd1;
    if (gd2 !== state.gd2Score) scoreUpdate.gd2Score = gd2;
    if (gd3 !== state.gd3Score) scoreUpdate.gd3Score = gd3;
    
    // Cập nhật tổng điểm nếu có điểm thành phần thay đổi
    if (Object.keys(scoreUpdate).length > 0 || total !== state.totalScore) {
        scoreUpdate.totalScore = total;
        
        // Cập nhật atomic các điểm và tổng điểm vào bảng điểm chính
        if (Object.keys(scoreUpdate).length > 0) {
             update(formMatchRef, scoreUpdate).catch(e => console.error("Lỗi cập nhật điểm:", e));
        }
    }
});


// ----------------------------------------------------
// EVENT LISTENERS & INITIALIZATION
// ----------------------------------------------------

// WIRING: Đồng bộ input của Admin với DB
displayElements.tournamentNameInput.addEventListener('input', () => setMatchKey('eventTitle', displayElements.tournamentNameInput.value));
displayElements.athleteNameInput.addEventListener('input', () => setMatchKey('athleteName', displayElements.athleteNameInput.value));

// WIRING: Nút chọn bài Quyền
displayElements.btnKhoiQuyen.addEventListener('click', (e) => setMatchKey('formName', e.target.getAttribute('data-form')));
displayElements.btnThapTuQuyen.addEventListener('click', (e) => setMatchKey('formName', e.target.getAttribute('data-form')));

// WIRING: Nút gửi điểm Giám định
displayElements.judgeButtons.forEach(button => {
    button.addEventListener('click', () => submitJudgeScore(parseInt(button.getAttribute('data-judge'))));
});

// WIRING: Nút Reset
displayElements.btnReset.addEventListener('click', resetForm);

// WIRING: Fullscreen
displayElements.btnFullscreenControl.addEventListener('click', () => {
    const el = document.getElementById('displaySection');
    if (!document.fullscreenElement) el.requestFullscreen && el.requestFullscreen();
    else document.exitFullscreen && document.exitFullscreen();
});

/** Hàm khởi tạo chính */
async function initialize() {
    // 1. Thực hiện xác thực (cần thiết cho Firebase Security Rules)
    try {
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
        console.log("Xác thực Firebase thành công.");
    } catch (error) {
        console.error("Lỗi xác thực Firebase:", error);
    }
    
    document.getElementById('appIdDisplay').innerText = canvasAppId;

    // 2. Khởi tạo hiển thị lần đầu
    updateDisplay();
    
    // 3. Đảm bảo dữ liệu mặc định có trong DB nếu lần đầu chạy
    const snapshot = await get(formMatchRef);
    if (!snapshot.exists()) {
        console.log("Khởi tạo dữ liệu bảng điểm mặc định...");
        await set(formMatchRef, {
            eventTitle: state.eventTitle,
            formName: state.formName,
            athleteName: state.athleteName,
            gd1Score: 0.00,
            gd2Score: 0.00,
            gd3Score: 0.00,
            totalScore: 0.00
        });
    }
    
    console.log("Hệ thống bảng điểm Quyền đã sẵn sàng.");
}

initialize();