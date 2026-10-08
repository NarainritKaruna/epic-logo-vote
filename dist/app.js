const BALLOT_VERSION = 'epic-logo-2026-02-ranked';
const VOTER_KEY = `epic-voter-${BALLOT_VERSION}`;
const RECEIPT_KEY = `epic-vote-receipt-${BALLOT_VERSION}`;
const PENDING_KEY = `epic-vote-pending-${BALLOT_VERSION}`;
const endpoint = String(window.EPIC_VOTE_ENDPOINT || '').trim();

const form = document.querySelector('#vote-form');
const cards = [...document.querySelectorAll('.concept-card')];
const rankButtons = [...document.querySelectorAll('.rank-button')];
const submitButton = document.querySelector('#submit-button');
const selectionText = document.querySelector('#selection-text');
const summaryNumber = document.querySelector('.summary-number');
const commentFields = [...document.querySelectorAll('[data-comment-index]')];
const formStatus = document.querySelector('#form-status');
const successPanel = document.querySelector('#success-panel');
const successDetail = document.querySelector('#success-detail');
const previewBanner = document.querySelector('#preview-banner');
const resetDemoButton = document.querySelector('#reset-demo');

const allowedConcepts = new Set(cards.map((card) => card.dataset.concept));
const isLocalHost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname);
const isPreviewMode = endpoint.length === 0 && isLocalHost;
const isUnconfiguredPublic = endpoint.length === 0 && !isLocalHost;
const rankings = { 1: '', 2: '', 3: '' };
let pendingVote = null;
let duplicateLock = false;
let submitting = false;

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function getVoterId() {
  let id = localStorage.getItem(VOTER_KEY);
  if (!id) {
    id = makeId();
    localStorage.setItem(VOTER_KEY, id);
  }
  return id;
}

function rankingIsComplete() {
  return Boolean(rankings[1] && rankings[2] && rankings[3]);
}

function readComments() {
  return Object.fromEntries(commentFields.map((field) => [field.dataset.commentIndex, field.value.trim()]));
}

function writeComments(comments = {}) {
  commentFields.forEach((field) => {
    field.value = String(comments[field.dataset.commentIndex] || '');
    field.dispatchEvent(new Event('input'));
  });
}

function renderRankings() {
  cards.forEach((card) => {
    const concept = card.dataset.concept;
    const rank = Object.keys(rankings).find((key) => rankings[key] === concept) || '';
    if (rank) card.dataset.currentRank = rank;
    else delete card.dataset.currentRank;

    card.querySelectorAll('.rank-button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.rank === rank));
      button.disabled = submitting || Boolean(pendingVote) || duplicateLock || isUnconfiguredPublic;
    });
  });

  const count = Object.values(rankings).filter(Boolean).length;
  summaryNumber.textContent = `${count}/3`;
  selectionText.textContent = count
    ? [1, 2, 3].filter((rank) => rankings[rank]).map((rank) => `อันดับ ${rank}: ${rankings[rank]}`).join(' · ')
    : 'กรุณาเลือกให้ครบ 3 อันดับ';
  commentFields.forEach((field) => {
    field.disabled = submitting || Boolean(pendingVote) || duplicateLock || isUnconfiguredPublic;
  });
  submitButton.disabled = submitting || duplicateLock || isUnconfiguredPublic || !rankingIsComplete();
  submitButton.textContent = submitting
    ? 'กำลังตรวจสอบ…'
    : pendingVote ? 'ตรวจสอบผลเดิมอีกครั้ง' : 'ส่งผลการจัดอันดับ';
}

function assignRank(concept, rank) {
  if (submitting || pendingVote || duplicateLock || isUnconfiguredPublic) return;
  const currentRank = Object.keys(rankings).find((key) => rankings[key] === concept);
  if (currentRank === rank) {
    rankings[rank] = '';
  } else {
    if (currentRank) rankings[currentRank] = '';
    rankings[rank] = concept;
  }
  formStatus.textContent = '';
  renderRankings();
}

function showReceipt(receipt) {
  form.hidden = true;
  successPanel.hidden = false;
  const topThree = `อันดับ 1 ${receipt.first_choice}, อันดับ 2 ${receipt.second_choice} และอันดับ 3 ${receipt.third_choice}`;
  successDetail.textContent = isPreviewMode
    ? `บันทึก ${topThree} ไว้ในเบราว์เซอร์นี้เพื่อการทดลองแล้ว`
    : `ยืนยันว่า ${topThree} ถูกบันทึกโดยไม่ระบุตัวตนแล้ว`;
  resetDemoButton.hidden = !isPreviewMode;
  successPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function setSubmitting(value) {
  submitting = value;
  renderRankings();
}

function makePayload({ firstChoice, secondChoice, thirdChoice, comments }) {
  const choices = [firstChoice, secondChoice, thirdChoice];
  if (!choices.every((choice) => allowedConcepts.has(choice))) throw new Error('Please rank three concepts.');
  if (new Set(choices).size !== 3) throw new Error('Each rank must use a different concept.');
  if (Object.values(comments).some((value) => value.length > 500)) throw new Error('Please shorten each comment to 500 characters.');

  return {
    voter_id: getVoterId(),
    submission_id: makeId(),
    first_choice: firstChoice,
    second_choice: secondChoice,
    third_choice: thirdChoice,
    comment_1: comments[1] || '',
    comment_2: comments[2] || '',
    comment_3: comments[3] || '',
    comment_4: comments[4] || '',
    comment_5: comments[5] || '',
    comment_6: comments[6] || '',
    ballot_version: BALLOT_VERSION,
    submitted_at: new Date().toISOString(),
  };
}

function isValidPending(payload) {
  const choices = [payload?.first_choice, payload?.second_choice, payload?.third_choice];
  return payload?.ballot_version === BALLOT_VERSION
    && /^[A-Za-z0-9-]{20,100}$/.test(payload.voter_id || '')
    && /^[A-Za-z0-9-]{20,100}$/.test(payload.submission_id || '')
    && choices.every((choice) => allowedConcepts.has(choice))
    && new Set(choices).size === 3
    && [1, 2, 3, 4, 5, 6].every((index) => String(payload[`comment_${index}`] || '').length <= 500);
}

function readPending() {
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_KEY));
    if (saved && isValidPending(saved)) return saved;
  } catch { /* A damaged local draft cannot be retried. */ }
  localStorage.removeItem(PENDING_KEY);
  return null;
}

function restorePending(payload) {
  rankings[1] = payload.first_choice;
  rankings[2] = payload.second_choice;
  rankings[3] = payload.third_choice;
  writeComments(Object.fromEntries([1, 2, 3, 4, 5, 6].map((index) => [index, payload[`comment_${index}`]])));
  formStatus.textContent = 'ยังยืนยันผลโหวตไม่ได้ ข้อมูลเดิมยังอยู่ กดตรวจสอบผลเดิมอีกครั้ง';
  renderRankings();
}

function readStatus(payload) {
  return new Promise((resolve, reject) => {
    const callback = `epicVoteStatus_${makeId().replace(/[^A-Za-z0-9_$]/g, '')}`;
    const script = document.createElement('script');
    let finished = false;
    let timeout;

    function finish(error, value) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      script.remove();
      delete window[callback];
      if (error) reject(error);
      else resolve(value);
    }

    window[callback] = (answer) => finish(null, answer);
    script.onerror = () => finish(new Error('Status request failed.'));
    try {
      const url = new URL(endpoint);
      url.searchParams.set('action', 'status');
      url.searchParams.set('voter_id', payload.voter_id);
      url.searchParams.set('submission_id', payload.submission_id);
      url.searchParams.set('ballot_version', BALLOT_VERSION);
      url.searchParams.set('callback', callback);
      script.src = url.toString();
      timeout = setTimeout(() => finish(new Error('Status request timed out.')), 8000);
      document.head.appendChild(script);
    } catch (error) {
      finish(error);
    }
  });
}

async function postBallot(payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    // Apps Script does not expose this cross-origin response. Confirmation comes from readStatus().
    await fetch(endpoint, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams(payload),
      signal: controller.signal,
    });
  } catch {
    // A network error can occur after the server has recorded the vote. Check the sheet before retrying.
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyBallot(payload) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const answer = await readStatus(payload);
      if (answer?.submission_id === payload.submission_id) {
        if (answer.status === 'recorded' || answer.status === 'duplicate') return answer.status;
      }
    } catch { /* Keep checking before leaving the vote pending. */ }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return 'uncertain';
}

async function submitVote(input) {
  if (isUnconfiguredPublic) throw new Error('Voting is not configured.');
  if (localStorage.getItem(RECEIPT_KEY)) throw new Error('This browser already has a receipt.');

  if (isPreviewMode) {
    const payload = makePayload(input);
    await new Promise((resolve) => setTimeout(resolve, 450));
    const receipt = { ...payload, mode: 'preview' };
    localStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt));
    showReceipt(receipt);
    return { status: 'submitted', ranking: [payload.first_choice, payload.second_choice, payload.third_choice] };
  }

  const payload = pendingVote || makePayload(input);
  if (!pendingVote) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
    pendingVote = payload;
    renderRankings();
  }

  await postBallot(payload);
  const status = await verifyBallot(payload);
  if (status === 'recorded') {
    const receipt = {
      first_choice: payload.first_choice,
      second_choice: payload.second_choice,
      third_choice: payload.third_choice,
      submitted_at: payload.submitted_at,
      mode: 'live',
    };
    localStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt));
    localStorage.removeItem(PENDING_KEY);
    pendingVote = null;
    showReceipt(receipt);
    return { status: 'submitted', ranking: [payload.first_choice, payload.second_choice, payload.third_choice] };
  }
  if (status === 'duplicate') {
    duplicateLock = true;
    localStorage.removeItem(PENDING_KEY);
    pendingVote = null;
    return { status: 'duplicate' };
  }
  return { status: 'uncertain' };
}

rankButtons.forEach((button) => {
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => {
    assignRank(button.closest('.concept-card').dataset.concept, button.dataset.rank);
  });
});

commentFields.forEach((field) => {
  field.addEventListener('input', () => {
    field.nextElementSibling.textContent = `${field.value.length} / 500`;
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting || duplicateLock || isUnconfiguredPublic) return;
  if (!rankingIsComplete()) {
    formStatus.textContent = 'กรุณาเลือกอันดับ 1, 2 และ 3 ให้กับโลโก้คนละแบบ';
    document.querySelector('.ballot').scrollIntoView({ behavior: 'smooth' });
    return;
  }

  formStatus.textContent = '';
  setSubmitting(true);
  try {
    const result = await submitVote({
      firstChoice: rankings[1],
      secondChoice: rankings[2],
      thirdChoice: rankings[3],
      comments: readComments(),
    });
    if (result.status === 'duplicate') {
      formStatus.textContent = 'เบราว์เซอร์นี้มีผลโหวตในชีตแล้ว จึงไม่บันทึกซ้ำ';
    } else if (result.status === 'uncertain') {
      formStatus.textContent = 'ยังยืนยันว่าได้รับผลโหวตแล้วไม่ได้ ข้อมูลเดิมยังอยู่ กรุณากดตรวจสอบผลเดิมอีกครั้ง';
    }
  } catch (error) {
    formStatus.textContent = pendingVote
      ? 'ยังยืนยันผลโหวตไม่ได้ ข้อมูลเดิมยังอยู่ กรุณากดตรวจสอบผลเดิมอีกครั้ง'
      : 'ยังส่งผลการจัดอันดับไม่ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง';
  } finally {
    setSubmitting(false);
  }
});

resetDemoButton.addEventListener('click', () => {
  localStorage.removeItem(RECEIPT_KEY);
  rankings[1] = '';
  rankings[2] = '';
  rankings[3] = '';
  writeComments();
  successPanel.hidden = true;
  form.hidden = false;
  renderRankings();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

if (isPreviewMode) previewBanner.hidden = false;
if (isUnconfiguredPublic) {
  previewBanner.hidden = false;
  previewBanner.querySelector('strong').textContent = 'ยังไม่เปิดรับผลโหวต';
  previewBanner.querySelector('span').textContent = 'ผู้ดูแลต้องเชื่อมต่อชีตรับคำตอบก่อน จึงจะส่งผลโหวตได้';
  formStatus.textContent = 'ขณะนี้ยังส่งผลโหวตไม่ได้ กรุณาติดต่อผู้ดูแล';
}

try {
  const previousReceipt = JSON.parse(localStorage.getItem(RECEIPT_KEY));
  if (previousReceipt?.first_choice && previousReceipt.mode === (isPreviewMode ? 'preview' : 'live')) {
    showReceipt(previousReceipt);
  } else {
    if (previousReceipt) localStorage.removeItem(RECEIPT_KEY);
    if (!isPreviewMode && !isUnconfiguredPublic) {
      pendingVote = readPending();
      if (pendingVote) restorePending(pendingVote);
    }
  }
} catch {
  // Storage may be unavailable in a restricted browser. Submission will show an error.
}
renderRankings();

if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  Promise.resolve(document.modelContext.registerTool({
    name: 'submit_ranked_anonymous_vote',
    title: 'ส่งผลจัดอันดับโลโก้ EPIC',
    description: 'จัดอันดับแบบโลโก้ EPIC ที่แตกต่างกันเป็นอันดับ 1, 2 และ 3 พร้อมส่งข้อเสนอแนะเพิ่มเติมโดยไม่ระบุตัวตน',
    inputSchema: {
      type: 'object',
      properties: {
        firstChoice: { type: 'string', enum: [...allowedConcepts] },
        secondChoice: { type: 'string', enum: [...allowedConcepts] },
        thirdChoice: { type: 'string', enum: [...allowedConcepts] },
        comments: {
          type: 'object',
          properties: {
            concept1: { type: 'string', maxLength: 500 },
            concept2: { type: 'string', maxLength: 500 },
            concept3: { type: 'string', maxLength: 500 },
            concept4: { type: 'string', maxLength: 500 },
            concept5: { type: 'string', maxLength: 500 },
            concept6: { type: 'string', maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
      required: ['firstChoice', 'secondChoice', 'thirdChoice'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      if (submitting || pendingVote || duplicateLock || isUnconfiguredPublic || localStorage.getItem(RECEIPT_KEY)) {
        throw new Error('A vote is already pending or recorded, or voting is not configured.');
      }
      const firstChoice = String(input?.firstChoice || '');
      const secondChoice = String(input?.secondChoice || '');
      const thirdChoice = String(input?.thirdChoice || '');
      const comments = Object.fromEntries([1, 2, 3, 4, 5, 6].map((index) => [index, String(input?.comments?.[`concept${index}`] || '').trim()]));
      rankings[1] = firstChoice;
      rankings[2] = secondChoice;
      rankings[3] = thirdChoice;
      writeComments(comments);
      renderRankings();
      setSubmitting(true);
      try {
        const result = await submitVote({ firstChoice, secondChoice, thirdChoice, comments });
        if (result.status !== 'submitted') throw new Error('Vote was not confirmed by the response sheet.');
        return result;
      } finally {
        setSubmitting(false);
      }
    },
  }, { signal: lifecycle.signal })).catch(() => {});
}
