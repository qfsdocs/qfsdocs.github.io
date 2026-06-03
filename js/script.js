// --- FIREBASE IMPORTS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, updateDoc, increment, setDoc, runTransaction, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getDatabase, ref, onValue, runTransaction as rtdbRunTransaction, query, orderByChild } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// --- FIREBASE CONFIGURATION ---
const FIRESTORE_DOWNLOAD_CONFIG = {
    apiKey: "AIzaSyCAmYCabtz0apNHmyw9w6Jlr2lPpyXDUKk", 
    authDomain: "downlodsqfs.firebaseapp.com",
    projectId: "downlodsqfs",
    storageBucket: "downlodsqfs.firebasestorage.app",
    messagingSenderId: "597637748461",
    appId: "1:597637748461:web:a24eb0794427a38aa11ee4",
    measurementId: "G-1FWDCC5GH4" 
};

const RTDB_REVIEW_CONFIG = {
    apiKey: "AIzaSyC46EyePwg6oytVGDOeNg_F1xtHaLLN_KI",
    authDomain: "quizforsurvival.firebaseapp.com",
    databaseURL: "https://quizforsurvival-default-rtdb.firebaseio.com",
    projectId: "quizforsurvival",
    storageBucket: "quizforsurvival.firebasestorage.app",
    messagingSenderId: "493584571443",
    appId: "1:493584571443:web:6438fb679c04699a4dd746",
    measurementId: "G-HN1S70HQHS"
};

// Environment variables
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Firebase App Instances
let fsDb = null;
let fsAuth = null;
let downloadCounterRef = null;
let rtdb = null;
let reviewsRef = null;
const likedReviewsKey = 'qfs_liked_reviews';

// --- UTILITIES ---
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const abbreviateNumber = (num) => {
    if (num === null || num === undefined) { return '0'; }
    return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1
    }).format(num);
};

// --- FIREBASE INIT ---
const initializeFirebase = async () => {
    try {
        // Firestore (Downloads)
        const fsApp = initializeApp(FIRESTORE_DOWNLOAD_CONFIG, "downloadApp");
        fsDb = getFirestore(fsApp);
        fsAuth = getAuth(fsApp);
        
        if (initialAuthToken) {
            await signInWithCustomToken(fsAuth, initialAuthToken);
        } else {
            await signInAnonymously(fsAuth);
        }
        
        downloadCounterRef = doc(fsDb, 'artifacts', appId, 'public', 'data', 'qfs_downloads', 'counter');
        const counterSnap = await getDoc(downloadCounterRef);
        if (!counterSnap.exists()) {
            await setDoc(downloadCounterRef, { count: 0 });
        }
        console.log("Firestore initialized.");

        // Realtime Database (Reviews)
        const rtdbApp = initializeApp(RTDB_REVIEW_CONFIG, "reviewApp");
        rtdb = getDatabase(rtdbApp);
        reviewsRef = ref(rtdb, 'reviews');
        console.log("RTDB initialized.");

    } catch (error) {
        console.error("Firebase init failed:", error);
    }
};

// --- DOWNLOAD COUNTER LOGIC ---
const startDownloadListener = () => {
    const countEl = document.getElementById('download-count-value');
    if (!downloadCounterRef || !countEl) return;

    onSnapshot(downloadCounterRef, (doc) => {
        const count = doc.exists() ? doc.data().count : 0;
        countEl.textContent = abbreviateNumber(count);
    }, (error) => {
        countEl.textContent = 'Error';
    });
};

const incrementDownloadCount = async () => {
    if (!downloadCounterRef) return;
    try {
        await runTransaction(fsDb, async (transaction) => {
            const sfDoc = await transaction.get(downloadCounterRef);
            if (!sfDoc.exists()) {
                transaction.set(downloadCounterRef, { count: 1 });
            } else {
                transaction.update(downloadCounterRef, { count: increment(1) });
            }
        });
    } catch (error) {
        console.error("Failed to increment download count:", error);
    }
};

// --- REVIEWS LOGIC ---
const startReviewListener = () => {
    const reviewsLoader = document.getElementById('reviews-loader');
    const reviewsContainer = document.getElementById('reviews-container');
    if (!reviewsRef || !reviewsContainer) return;

    const reviewsQuery = query(reviewsRef, orderByChild('timestamp'));

    onValue(reviewsQuery, (snapshot) => {
        reviewsContainer.innerHTML = ''; 
        if (!snapshot.exists()) {
            reviewsContainer.innerHTML = '<p class="text-white/70 text-center">No reviews yet. Be the first to leave one from the game!</p>';
            if (reviewsLoader) reviewsLoader.style.display = 'none';
            return;
        }

        const reviews = [];
        snapshot.forEach((childSnapshot) => {
            reviews.unshift({ id: childSnapshot.key, ...childSnapshot.val() });
        });

        const likedReviews = getLikedReviews();
        reviews.forEach(review => {
            reviewsContainer.insertAdjacentHTML('beforeend', createReviewCard(review, likedReviews.includes(review.id)));
        });

        if (reviewsLoader) reviewsLoader.style.display = 'none';
    }, (error) => {
        if (reviewsContainer) reviewsContainer.innerHTML = '<p class="text-red-400 text-center">Error loading reviews.</p>';
        if (reviewsLoader) reviewsLoader.style.display = 'none';
    });
};

const createReviewCard = (review, hasLiked) => {
    const date = new Date(review.timestamp * 1000);
    const formattedDate = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const likeCount = review.likes || 0;

    return `
        <div class="review-card space-y-4">
            <div class="flex justify-between items-center border-b border-link-primary/30 pb-3">
                <h4 class="text-xl font-bold text-link-primary">${safeText(review.userName || 'Anonymous')}</h4>
                <span class="text-sm text-white/60">${formattedDate}</span>
            </div>
            <p class="review-text-bubble text-white/90 text-md leading-relaxed whitespace-pre-wrap">${safeText(review.reviewText)}</p>
            <div class="flex justify-between items-center pt-3">
                <span class="playtime-bubble text-sm italic">Playtime: ${(review.playtimeHours || 0).toFixed(1)} hours</span>
                <button class="like-button" data-review-id="${review.id}" ${hasLiked ? 'disabled' : ''}>
                    <i class="fas fa-thumbs-up mr-2"></i> ${hasLiked ? 'Liked' : 'Helpful'} (${likeCount})
                </button>
            </div>
        </div>
    `;
};

const safeText = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

const incrementReviewLike = (reviewId) => {
    if (!rtdb) return;
    const button = document.querySelector(`button[data-review-id="${reviewId}"]`);
    if (!button || button.disabled) return;

    button.disabled = true;
    addLikedReview(reviewId);
    button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Liking...';

    const likeRef = ref(rtdb, `reviews/${reviewId}/likes`);
    rtdbRunTransaction(likeRef, (currentLikes) => (currentLikes || 0) + 1)
        .catch(() => {
            removeLikedReview(reviewId);
            const currentButton = document.querySelector(`button[data-review-id="${reviewId}"]`);
            if(currentButton) {
                currentButton.disabled = false;
                currentButton.innerHTML = '<i class="fas fa-thumbs-up mr-2"></i> Helpful (Error)';
            }
        });
};

const getLikedReviews = () => JSON.parse(localStorage.getItem(likedReviewsKey) || '[]');
const addLikedReview = (reviewId) => {
    const liked = getLikedReviews();
    if (!liked.includes(reviewId)) {
        liked.push(reviewId);
        localStorage.setItem(likedReviewsKey, JSON.stringify(liked));
    }
};
const removeLikedReview = (reviewId) => {
    const liked = getLikedReviews().filter(id => id !== reviewId);
    localStorage.setItem(likedReviewsKey, JSON.stringify(liked));
};

// --- POPULATORS ---
const populateChangelog = (gameData) => {
    const container = document.getElementById('changelog-content');
    if (!container) return;

    let html = '';
    gameData.changelog.forEach((entry) => {
        const changes = entry.changes.map((c, index) => {
            let content = c.trim();
            content = content.charAt(0).toUpperCase() + content.slice(1);
            return `
                <div class="changelog-change-block p-4 sm:p-6 rounded-lg shadow-md">
                    <h5 class="text-link-primary font-bold mb-1">${entry.changes.length > 1 ? `Update ${index + 1}:` : 'Update:'}</h5>
                    <div class="text-white/80 text-lg leading-relaxed">${content}</div>
                </div>
            `;
        });
        html += `
            <div class="changelog-entry">
                <div class="changelog-header transition-colors duration-300">
                    <div class="flex flex-col sm:flex-row sm:items-baseline">
                        <span class="text-button-primary text-xl font-bold mr-4">${entry.version}</span>
                    </div>
                    <i class="fas fa-chevron-down text-xl text-link-primary transition-transform duration-300"></i>
                </div>
                <div class="changelog-content overflow-hidden" style="max-height: 0;">
                    <div class="p-4 sm:p-6 pb-8 space-y-4">${changes.join('')}</div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
    
    document.querySelectorAll('.changelog-header').forEach(header => {
        header.addEventListener('click', () => {
            const entry = header.closest('.changelog-entry');
            const content = entry.querySelector('.changelog-content');
            const icon = header.querySelector('i');
            const isOpen = content.classList.contains('open');

            document.querySelectorAll('.changelog-content.open').forEach(openContent => {
                if (openContent !== content) {
                    openContent.style.maxHeight = '0';
                    openContent.classList.remove('open');
                    openContent.closest('.changelog-entry').querySelector('i').classList.remove('rotated');
                }
            });

            if (isOpen) {
                content.style.maxHeight = '0';
                content.classList.remove('open');
                icon.classList.remove('rotated');
            } else {
                content.style.maxHeight = content.scrollHeight + 50 + 'px';
                content.classList.add('open');
                icon.classList.add('rotated');
            }
        });
    });
};

const populateAbout = (gameData) => {
    const toolsEl = document.getElementById('tools-content');
    const mysteryEl = document.getElementById('mystery-box-content');
    const tripleEl = document.getElementById('lucky-triples-content');
    if (!toolsEl) return;

    toolsEl.innerHTML = gameData.tools.map(tool => `
        <div class="info-bubble tool-bubble">
            <h4><span>${tool.name}</span><span class="tool-price">${tool.price}</span></h4>
            <p class="bubble-description">${tool.description}</p>
            <p class="tool-cooldown"><i class="fas fa-hourglass-half mr-1"></i> Cooldown: ${tool.cooldown}</p>
        </div>
    `).join('');

    mysteryEl.innerHTML = '<div class="space-y-4">' + gameData.mysteryBox.map(item => `
        <div class="info-bubble reward-bubble">
            <h4>${item.item} <span class="reward-rarity ${item.rarity.includes('Super rare') ? 'super-rare' : ''}">[${item.rarity}]</span></h4>
            <p class="bubble-description">${item.howItWorks}</p>
        </div>
    `).join('') + '</div>';

    tripleEl.innerHTML = '<div class="space-y-4">' + gameData.luckyTriples.map(item => `
        <div class="info-bubble reward-bubble">
            <h4>${item.item} <span class="reward-rarity">[${item.chance}]</span></h4>
            <p class="bubble-description">${item.howItWorks}</p>
        </div>
    `).join('') + '</div>';
};

const populateDatabase = (gameData) => {
    const modesEl = document.getElementById('modes-content');
    const diffEl = document.getElementById('difficulties-content');
    const achEl = document.getElementById('achievements-content');
    if (!modesEl) return;

    modesEl.innerHTML = gameData.modes.map(mode => `
        <div class="info-bubble mode-bubble">
            <h4><i class="${mode.icon}"></i> ${mode.name} Mode</h4>
            <p class="bubble-description">${mode.description}</p>
        </div>
    `).join('');

    diffEl.innerHTML = gameData.difficulties.map(diff => `
        <div class="info-bubble difficulty-bubble">
            <h4>${diff.name}</h4>
            <p class="text-white/80 text-sm"><span class="difficulty-score">Score to Win:</span> ${diff.score}</p>
            <p class="bubble-description">${diff.description}</p>
        </div>
    `).join('');

    achEl.innerHTML = gameData.achievements.map(ach => `
        <div class="info-bubble achievement-bubble">
            <div class="achievement-header"><i class="${ach.icon}"></i><h4>${ach.name}</h4></div>
            <p class="bubble-subtitle">${ach.subtitle}</p>
            <p class="bubble-description">${ach.description}</p>
        </div>
    `).join('');
};

// --- HOMEPAGE LOGIC ---
const fetchMasterData = async (url) => {
    try {
        const response = await fetch(url, { cache: "no-store" });
        return await response.json();
    } catch (e) {
        console.error("Fetch failed", e);
        return null;
    }
};

const formatContentText = (text, iconType = 'fa-feather') => {
    if (!text) return '';
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    let html = '<ul class="list-none space-y-3 pl-0">';
    lines.forEach(line => {
        if (line.startsWith('•')) {
            const content = line.substring(1).trim();
            let iconHtml = iconType === 'circle' ? 
                `<span class="text-link-primary text-xl mr-3 flex-shrink-0 leading-none pt-[2px]">&#9679;</span>` : 
                `<span class="text-link-primary text-xl mr-3 flex-shrink-0 leading-none pt-0.5"><i class="fas fa-feather"></i></span>`;
            html += `<li class="flex items-start text-white/90 text-lg">${iconHtml}<span class="block">${content.charAt(0).toUpperCase() + content.slice(1)}</span></li>`;
        } else if (line.endsWith(':') || line.match(/^\d+\./)) {
            html += `<li class="pt-4 pb-1 text-xl font-bold text-button-primary">${line}</li>`;
        } else {
            html += `<li class="text-white/80 pl-6 text-lg">${line}</li>`;
        }
    });
    return html + '</ul>';
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', async () => {
    // Mobile Menu
    const menuButton = document.getElementById('menu-button');
    if (menuButton) {
        menuButton.addEventListener('click', () => {
            const navMenu = document.getElementById('nav-menu');
            const menuIcon = document.getElementById('menu-icon');
            const isOpen = navMenu.classList.toggle('open');
            menuIcon.classList.toggle('fa-bars', !isOpen);
            menuIcon.classList.toggle('fa-times', isOpen);
        });
    }

    // Initialize Firebase
    await initializeFirebase();

    // Route Logic based on HTML content existence
    const gameDataEl = document.getElementById('game-data-json');
    const gameData = gameDataEl ? JSON.parse(gameDataEl.textContent) : null;

    // 1. Home Page Logic
    if (document.getElementById('content-home')) {
        startDownloadListener();
        
        // Modals
        const dlModal = document.getElementById('download-modal-backdrop');
        const wcModal = document.getElementById('welcome-modal-backdrop');
        
        const showDlModal = (ver) => {
            document.body.classList.add('modal-open');
            document.getElementById('modal-message').innerHTML = `The automatic download for version <b>${ver}</b> is starting now. Check your browser's download folder.`;
            dlModal.classList.remove('opacity-0', 'pointer-events-none');
            document.getElementById('download-modal-content').classList.remove('scale-90');
        };

        const hideDlModal = () => {
            document.body.classList.remove('modal-open');
            dlModal.classList.add('opacity-0', 'pointer-events-none');
            document.getElementById('download-modal-content').classList.add('scale-90');
        };
        
        if(dlModal) dlModal.onclick = (e) => { if(e.target.id === 'download-modal-backdrop') hideDlModal(); };
        document.getElementById('modal-close-button')?.addEventListener('click', hideDlModal);

        const masterData = await fetchMasterData('https://gist.githubusercontent.com/Fillabrona/5a17fe172177f74a4a65196ba1b53c50/raw/bb7224e4e7d0400f4865c5993bbf0e6745bcb3d2/downloadinfo');
        
        if (masterData) {
            const verMatch = masterData.versionInfo.match(/Game:.*(v[\d.]+)/);
            const verNumber = verMatch ? verMatch[1] : 'Unknown';
            
            const authMatch = masterData.versionInfo.match(/Author: (.*?)\s-\s(https:\/\/fillabrona\.itch\.io\/)/);
            const authorName = authMatch ? authMatch[1] : 'Fillabrona';
            const authorUrl = authMatch ? authMatch[2] : 'https://fillabrona.itch.io/';

            document.getElementById('version-display').textContent = verNumber;
            document.getElementById('author-info').innerHTML = `by <a href="${authorUrl}" target="_blank" class="text-link-primary hover:text-white font-semibold">${authorName}</a>`;
            document.getElementById('file-size-value').textContent = masterData.fileSize || 'N/A';
            
            document.getElementById('latest-version-heading').innerHTML = `<i class="fas fa-tag mr-3 text-2xl"></i> Latest Update`;
            const updateTxt = masterData.versionInfo.split('--- LATEST UPDATE ---')[1]?.trim();
            document.getElementById('latest-version-content').innerHTML = formatContentText(updateTxt, 'fa-feather');
            
            const nextTxt = masterData.whatsNext.split('--- UPCOMING FEATURES ---')[1]?.trim();
            document.getElementById('whats-next-content').innerHTML = formatContentText(nextTxt, 'circle');

            document.getElementById('file-stats-placeholder').classList.add('hidden');
            document.getElementById('file-stats-content').classList.remove('hidden');

            const dlBtn = document.getElementById('download-button');
            const wcBtn = document.getElementById('welcome-download-button');
            
            if (masterData.downloadLink) {
                dlBtn.setAttribute('data-download-url', masterData.downloadLink);
                dlBtn.disabled = false;
                dlBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                dlBtn.innerHTML = '<i class="fas fa-download mr-2"></i> Download Latest Version';
                
                if(wcBtn) {
                    wcBtn.classList.remove('animate-pulse');
                    wcBtn.innerHTML = `<i class="fas fa-download mr-2"></i> Download ${verNumber}`;
                }

                const doDownload = async (btn, isWelcome) => {
                    if (btn.disabled) return;
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Starting...';
                    await incrementDownloadCount();
                    if(isWelcome) {
                        document.body.classList.remove('modal-open');
                        wcModal.classList.add('opacity-0', 'pointer-events-none');
                        document.getElementById('welcome-modal-content').classList.add('scale-90');
                    }
                    setTimeout(() => {
                        showDlModal(verNumber);
                        window.location.href = masterData.downloadLink;
                        setTimeout(() => {
                            btn.disabled = false;
                            btn.innerHTML = isWelcome ? `<i class="fas fa-download mr-2"></i> Download ${verNumber}` : '<i class="fas fa-download mr-2"></i> Download Latest Version';
                        }, 1500);
                    }, 500);
                };

                dlBtn.addEventListener('click', (e) => { e.preventDefault(); doDownload(dlBtn, false); });
                wcBtn?.addEventListener('click', (e) => { e.preventDefault(); doDownload(wcBtn, true); });
            }
            
            // Welcome Modal Logic
            if (wcModal && !window.location.search.includes('no-modal')) {
                await delay(300);
                document.body.classList.add('modal-open');
                wcModal.classList.remove('opacity-0', 'pointer-events-none');
                document.getElementById('welcome-modal-content').classList.remove('scale-90');
                
                document.getElementById('welcome-continue-button').addEventListener('click', () => {
                    document.body.classList.remove('modal-open');
                    wcModal.classList.add('opacity-0', 'pointer-events-none');
                    document.getElementById('welcome-modal-content').classList.add('scale-90');
                });
            }
        }
    }

    // 2. Reviews Page Logic
    if (document.getElementById('content-reviews')) {
        startReviewListener();
        document.body.addEventListener('click', (e) => {
            const btn = e.target.closest('.like-button');
            if (btn) {
                e.preventDefault();
                const rid = btn.getAttribute('data-review-id');
                if (rid) incrementReviewLike(rid);
            }
        });
    }

    // 3. Static Data Pages
    if (gameData) {
        // NEW: Add artificial delay so the loading skeletons are visible
        await delay(600); 
        populateChangelog(gameData);
        populateAbout(gameData);
        populateDatabase(gameData);
    }
});
