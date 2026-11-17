// The code in the newest email to EMAIL whose subject has SUBJECT, from Mailpit, where the local
// stack sends Auth's email (docs/development.md, "Email"). The code starts the subject.
const response = http.get(
  'http://127.0.0.1:54324/api/v1/search?query=' + encodeURIComponent('to:' + EMAIL),
);
const message = json(response.body).messages.find((m) => m.Subject.indexOf(SUBJECT) >= 0);
if (!message) {
  throw new Error('No email to ' + EMAIL + ' about "' + SUBJECT + '" yet');
}
output.code = message.Subject.match(/^\d{6}/)[0];
