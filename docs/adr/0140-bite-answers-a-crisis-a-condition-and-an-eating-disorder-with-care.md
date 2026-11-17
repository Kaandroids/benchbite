# 0140. Bite answers a crisis, a health condition and an eating disorder with care

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

Bite's safety rules (ADR 0052, ADR 0053) cover pain and injury, low targets, goals too low or too
fast, pregnancy and signs of an eating disorder. The app now says that its plans and Bite are no
medical advice (#560), and how Bite answers is the other half of that. Three cases had no rule:
someone speaking of ending their life, which a chat about weight and food can meet; a condition
such as diabetes with insulin, which changes what calories and training are safe; and an eating
disorder the user names, or that Bite's notebook keeps from an earlier chat, while the rule spoke
only of signs.

## Decision

- **A crisis comes before coaching.** When the user speaks of harming themselves or of not wanting
  to live, Bite answers with care, says they deserve support now, and urges them to contact
  emergency services, a crisis line where they are, or someone they trust. That answer holds no
  calorie, weight or training numbers or plans, no phone number Bite is not sure of, no card,
  proposal or note, and starts with a neutral or sad face. The rule comes first among the safety
  rules.
- **A health condition keeps Bite general.** For one that changes what is safe, such as diabetes,
  a heart, kidney or liver condition, or a medication that affects weight or appetite, told by the
  user or kept in the notebook, Bite gives general advice, never suggests less than the targets or
  the calorie floor, whichever is higher, and says to check changes with the user's doctor.
- **An eating disorder counts however Bite learns of it.** Told by the user, kept in the notebook
  or seen in signs, now or in the past: Bite is gentle, gives no numbers toward losing weight, as
  calorie cuts, target weights or rates of loss, and suggests professional help. What the user
  logged and their targets as the app shows them may still be named, as a note kept for good
  would otherwise bar them in every later chat.
- **"I recommend" is advice, not a card.** The check that tells Bite when it spoke of a card it did
  not make no longer counts the Turkish "öneririm" or the German "ich schlage vor", so that a care
  answer, as to see a doctor, costs no further request.

## Alternatives considered

- **Crisis numbers in the prompt, by country:** a wrong or outdated number in a crisis is worse
  than none, and the app does not know where the user is. Bite names the kinds of help instead,
  and a number only when it is sure of it.
- **Ending the chat or blocking Bite after such a message:** it would leave the user alone at the
  worst moment; a caring answer that points to help is what is wanted.
- **Refusing to coach anyone with a health condition:** most can train and eat well with general
  advice; the risk is in specific cuts, which the rule leaves to their doctor.
- **Barring every number after an eating disorder:** Bite could not say what the user logged,
  which the app shows anyway, and the notebook keeps such a note for good.

## Consequences

Bite's answers in these cases rest on the model following its rules; they were checked by hand
against the real model, and a set of cases run regularly is #301. A user who mentions a condition
in passing gets a word about their doctor with changes, which may repeat across chats while the
notebook keeps it.
