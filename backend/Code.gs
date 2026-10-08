/**
 * EPIC anonymous logo ballot — Google Sheets receiver.
 * Bind this script to the response spreadsheet (Extensions > Apps Script).
 */

const BALLOT_VERSION = 'epic-logo-2026-02-ranked';
const SPREADSHEET_ID_KEY = 'EPIC_VOTES_SPREADSHEET_ID';
const VOTES_SHEET = 'Votes';
const RESULTS_SHEET = 'Results';
const CONCEPTS = ['แบบที่ 1', 'แบบที่ 2', 'แบบที่ 3', 'แบบที่ 4', 'แบบที่ 5', 'แบบที่ 6'];
const ID_PATTERN = /^[A-Za-z0-9-]{20,100}$/;

function setupBallot() {
  // A bound script has an active spreadsheet in the editor, but not as a web app.
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Run setupBallot from the EPIC Logo Votes spreadsheet.');
  PropertiesService.getScriptProperties().setProperty(SPREADSHEET_ID_KEY, spreadsheet.getId());
  ensureSheets_(spreadsheet);
}

function doGet(event) {
  const fields = (event && event.parameter) || {};
  if (fields.action !== 'status') return response_('EPIC ballot receiver is ready.');

  const callback = String(fields.callback || '').trim();
  if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,99}$/.test(callback)) return response_('invalid callback');

  const voterId = String(fields.voter_id || '').trim();
  const submissionId = String(fields.submission_id || '').trim();
  const ballotVersion = String(fields.ballot_version || '').trim();
  let status = 'invalid';

  if (ID_PATTERN.test(voterId) && ID_PATTERN.test(submissionId) && ballotVersion === BALLOT_VERSION) {
    try {
      const votes = getSpreadsheet_().getSheetByName(VOTES_SHEET);
      status = votes ? voteStatus_(votes, voterId, submissionId) : 'unavailable';
    } catch (error) {
      console.error(error);
      status = 'unavailable';
    }
  }

  // JSONP is used only for this minimal, read-only acknowledgement. Never return comments or votes.
  const body = `${callback}(${JSON.stringify({ status, submission_id: submissionId })});`;
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    lock.waitLock(10000);
    locked = true;

    const fields = (event && event.parameter) || {};
    const voterId = String(fields.voter_id || '').trim();
    const submissionId = String(fields.submission_id || '').trim();
    const firstChoice = String(fields.first_choice || '').trim();
    const secondChoice = String(fields.second_choice || '').trim();
    const thirdChoice = String(fields.third_choice || '').trim();
    const comments = [1, 2, 3, 4, 5, 6].map((index) => String(fields[`comment_${index}`] || '').trim());
    const ballotVersion = String(fields.ballot_version || '').trim();
    const submittedAt = String(fields.submitted_at || '').trim();

    if (!ID_PATTERN.test(voterId) || !ID_PATTERN.test(submissionId)) return response_('invalid id');
    const choices = [firstChoice, secondChoice, thirdChoice];
    if (!choices.every((choice) => CONCEPTS.indexOf(choice) !== -1)) return response_('invalid ranking');
    if (new Set(choices).size !== 3) return response_('duplicate ranking');
    if (comments.some((comment) => comment.length > 500)) return response_('comment too long');
    if (ballotVersion !== BALLOT_VERSION) return response_('invalid ballot');

    const votes = ensureSheets_().votes;
    const status = voteStatus_(votes, voterId, submissionId);
    if (status === 'recorded') return response_('ok'); // Retrying the same request is safe.
    if (status === 'duplicate') return response_('duplicate');

    votes.appendRow([
      new Date(),
      voterId,
      firstChoice,
      secondChoice,
      thirdChoice,
      safeCell_(comments[0]),
      safeCell_(comments[1]),
      safeCell_(comments[2]),
      safeCell_(comments[3]),
      safeCell_(comments[4]),
      safeCell_(comments[5]),
      ballotVersion,
      submittedAt,
      submissionId,
    ]);
    SpreadsheetApp.flush();
    return response_('ok');
  } catch (error) {
    console.error(error);
    return response_('error');
  } finally {
    if (locked) lock.releaseLock();
  }
}

function voteStatus_(votes, voterId, submissionId) {
  const count = votes.getLastRow() - 1;
  if (count <= 0) return 'missing';

  const voterIds = votes.getRange(2, 2, count, 1).getDisplayValues();
  const submissionIds = votes.getRange(2, 14, count, 1).getDisplayValues();
  let voterAlreadyVoted = false;
  for (let index = 0; index < count; index += 1) {
    if (submissionIds[index][0] === submissionId) {
      return voterIds[index][0] === voterId ? 'recorded' : 'duplicate';
    }
    if (voterIds[index][0] === voterId) voterAlreadyVoted = true;
  }
  return voterAlreadyVoted ? 'duplicate' : 'missing';
}

function getSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_KEY);
  if (!spreadsheetId) throw new Error('Run setupBallot before deploying the web app.');
  return SpreadsheetApp.openById(spreadsheetId);
}

function ensureSheets_(spreadsheet = getSpreadsheet_()) {
  let votes = spreadsheet.getSheetByName(VOTES_SHEET);
  let results = spreadsheet.getSheetByName(RESULTS_SHEET);

  if (!votes) votes = spreadsheet.insertSheet(VOTES_SHEET);
  if (votes.getLastRow() === 0) {
    votes.appendRow(['Recorded at', 'Anonymous browser ID', '1st choice', '2nd choice', '3rd choice', 'Comment 1', 'Comment 2', 'Comment 3', 'Comment 4', 'Comment 5', 'Comment 6', 'Ballot', 'Browser timestamp', 'Submission ID']);
    votes.setFrozenRows(1);
    votes.getRange('A1:N1').setFontWeight('bold').setBackground('#071b38').setFontColor('#ffffff');
    votes.setColumnWidth(1, 170);
    votes.setColumnWidth(2, 280);
    votes.setColumnWidths(3, 3, 110);
    votes.setColumnWidths(6, 6, 260);
    votes.setColumnWidth(14, 280);
  } else if (votes.getRange('N1').getValue() !== 'Submission ID') {
    // Adds the receipt column when updating a sheet created by the earlier version.
    votes.getRange('N1').setValue('Submission ID').setFontWeight('bold').setBackground('#071b38').setFontColor('#ffffff');
    votes.setColumnWidth(14, 280);
  }

  if (!results) results = spreadsheet.insertSheet(RESULTS_SHEET);
  if (results.getLastRow() === 0) {
    results.getRange('A1:E7').setValues([
      ['Concept', '1st', '2nd', '3rd', 'Points'],
      ['แบบที่ 1', '=COUNTIF(Votes!C:C,A2)', '=COUNTIF(Votes!D:D,A2)', '=COUNTIF(Votes!E:E,A2)', '=B2*3+C2*2+D2'],
      ['แบบที่ 2', '=COUNTIF(Votes!C:C,A3)', '=COUNTIF(Votes!D:D,A3)', '=COUNTIF(Votes!E:E,A3)', '=B3*3+C3*2+D3'],
      ['แบบที่ 3', '=COUNTIF(Votes!C:C,A4)', '=COUNTIF(Votes!D:D,A4)', '=COUNTIF(Votes!E:E,A4)', '=B4*3+C4*2+D4'],
      ['แบบที่ 4', '=COUNTIF(Votes!C:C,A5)', '=COUNTIF(Votes!D:D,A5)', '=COUNTIF(Votes!E:E,A5)', '=B5*3+C5*2+D5'],
      ['แบบที่ 5', '=COUNTIF(Votes!C:C,A6)', '=COUNTIF(Votes!D:D,A6)', '=COUNTIF(Votes!E:E,A6)', '=B6*3+C6*2+D6'],
      ['แบบที่ 6', '=COUNTIF(Votes!C:C,A7)', '=COUNTIF(Votes!D:D,A7)', '=COUNTIF(Votes!E:E,A7)', '=B7*3+C7*2+D7'],
    ]);
    results.setFrozenRows(1);
    results.getRange('A1:E1').setFontWeight('bold').setBackground('#f7ad21').setFontColor('#071b38');
    results.setColumnWidth(1, 150);
    results.setColumnWidths(2, 4, 100);
  }

  return { votes, results };
}

function safeCell_(value) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function response_(message) {
  return ContentService.createTextOutput(message).setMimeType(ContentService.MimeType.TEXT);
}
