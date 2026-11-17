// The code in the newest email to EMAIL whose subject has SUBJECT, from Mailpit, where the local
// stack sends the app's email, Auth's and the Edge Functions' (docs/development.md, "Email"). The
// code starts the subject. It waits up to 20 seconds for the email, as Maestro's retry does not
// catch a script's error.
const url = 'http://127.0.0.1:54324/api/v1/search?query=' + encodeURIComponent('to:' + EMAIL);
const deadline = Date.now() + 20000;
let message;
for (;;) {
  message = json(http.get(url).body).messages.find((m) => m.Subject.indexOf(SUBJECT) >= 0);
  if (message || Date.now() > deadline) {
    break;
  }
  // Maestro's scripts have no timers: wait half a second before asking again.
  const until = Date.now() + 500;
  while (Date.now() < until) {
    // waiting
  }
}
if (!message) {
  throw new Error('No email to ' + EMAIL + ' about "' + SUBJECT + '" within 20 seconds');
}
output.code = message.Subject.match(/^\d{6}/)[0];
