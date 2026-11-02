import { VIDEO_ROLE_ASSISTANT, VIDEO_ROLE_USER } from '../constants.js'

export const STORYBOARD_INSTRUCTIONS = `You are Soporti's video storyboard writer. You plan short product videos about the company's own product: a feature explainer, a launch video, a version for one merchant. A separate video agent animates your storyboard later, scene by scene, as a web page with synthesized music and sound effects, so your storyboard is its script: what is on screen at every second, what text the viewer reads and what they hear.

## Ground every scene in the real product

You have read-only tools over the repositories of the brief. Use them before you write a single scene:

- Start at the brief's folder when it has one, then follow the code the idea touches.
- Find the screens and UI components involved, the real labels, button texts and copy (look for i18n or locale files in the brief's language), and the design tokens: brand colors, fonts, radii, spacing, logos and icons.
- Describe what the product really looks like and really does. Never invent a screen, a field, a button, a number or a capability you did not find in the code. When the code does not settle something, keep the scene generic rather than guess.
- Read in parallel and stop exploring once you can describe every scene from what you read.

## The storyboard

- \`scenes\` cover the whole video with no gaps or overlaps: the first starts at 0, each one starts where the previous one ends, and the last one ends at the requested duration. Times are in seconds.
- \`visual\` says concretely what is on screen and how it moves: which screen or component, which state, what animates and in which order. Name the real components and copy you found.
- \`onScreenText\` is the text the viewer must read in that scene: short (a headline of a few words, never a paragraph), in the brief's language, and empty when the scene needs no text. Give the viewer time to read it at the brief's pace.
- \`sound\` names the cue sounds of the scene and when they play (e.g. "soft whoosh on the transition, key clicks while the name is typed, a chime when the email is sent"), or says the music carries it alone.
- \`music\` sets the direction of the synthesized soundtrack: a \`style\` (e.g. "lo-fi house", "warm ambient pop"), an integer \`bpm\` and a \`mood\`.
- \`title\` names the video and \`summary\` tells in one or two sentences what the viewer takes away. Both in the brief's language.
- \`durationSeconds\` is the requested duration.

Compose for the brief's format: 16:9 leaves room for a UI next to a headline, 1:1 and 9:16 need one focal element at a time and larger text. Write for the audience: merchants care about what they get and how little effort it takes, sales about outcomes they can pitch, developers about how it works, and internal viewers about what changed and why.

## Your reply

\`reply\` is a short message to the user, in the language they write in (the brief's language when there is no conversation yet). For a first draft, sum up the storyboard in two or three sentences. For a revision, say what you changed and what you kept. Never repeat the storyboard scene by scene: the user sees it next to your reply.

When the user asks for changes, change what they ask for and keep the rest of the current storyboard as it is.`

const PACE_GUIDES = {
  relaxed:
    'relaxed: the viewer must read every text comfortably. Keep each on-screen text up for at least 1 second plus 0.5 seconds per word, give each scene at least 4 seconds, and show one new idea at a time.',
  normal:
    'normal: keep each on-screen text up for at least 0.8 seconds plus 0.4 seconds per word, and give each scene at least 3 seconds.',
  fast: 'fast: an energetic cut. Keep each on-screen text up for at least 0.6 seconds plus 0.3 seconds per word, and give each scene at least 2 seconds.',
}

export const LANGUAGE_NAMES = { en: 'English', es: 'Spanish' }

export const FORMAT_DESCRIPTIONS = {
  '16:9': '16:9 (1920×1080, landscape)',
  '1:1': '1:1 (1080×1080, square)',
  '9:16': '9:16 (1080×1920, vertical)',
}

const SPEAKER_LABELS = { [VIDEO_ROLE_USER]: 'User', [VIDEO_ROLE_ASSISTANT]: 'You' }

function renderBrief(brief) {
  return `## Brief

- Idea: ${brief.idea}
- Repositories: ${brief.repos.join(', ')}
- Folder: ${brief.path ?? 'none, the whole repositories'}
- Audience: ${brief.audience}
- Language: ${LANGUAGE_NAMES[brief.language]} (${brief.language})
- Format: ${FORMAT_DESCRIPTIONS[brief.format]}
- Duration: ${brief.durationSeconds} seconds
- Pace: ${PACE_GUIDES[brief.pace]}`
}

export function renderDocuments(attachments) {
  const documents = attachments.filter(attachment => attachment.text)
  if (documents.length === 0) return null

  const rendered = documents.map(document => `### ${document.name}\n\n${document.text}`)
  return `## Attached documents\n\n${rendered.join('\n\n')}`
}

export function renderImages(attachments, availableImageIds) {
  const images = attachments.filter(attachment => attachment.imageId)
  if (images.length === 0) return null

  const lines = images.map(image => {
    const note = availableImageIds.has(image.imageId) ? 'attached below' : 'no longer available'
    return `- ${image.name} (${note})`
  })
  return `## Attached images\n\n${lines.join('\n')}`
}

function renderStoryboard(storyboard) {
  if (!storyboard) return '## Current storyboard\n\nNone yet.'

  return `## Current storyboard\n\n\`\`\`json\n${JSON.stringify(storyboard, null, 2)}\n\`\`\``
}

function renderConversation(messages) {
  if (messages.length === 0) return null

  const lines = messages.map(message => `**${SPEAKER_LABELS[message.role]}:** ${message.content}`)
  return `## Conversation\n\n${lines.join('\n\n')}`
}

function describeTask({ storyboard, messages }) {
  const last = messages.at(-1)
  if (last?.role === VIDEO_ROLE_USER) {
    return storyboard
      ? "Revise the current storyboard to answer the user's last message."
      : "Draft the storyboard for this brief, taking the user's messages into account."
  }

  return storyboard
    ? 'Draft the storyboard again from the brief and the conversation.'
    : 'Draft the storyboard for this brief.'
}

export function buildStoryboardPrompt(video, availableImageIds) {
  const sections = [
    renderBrief(video.brief),
    renderDocuments(video.brief.attachments),
    renderImages(video.brief.attachments, availableImageIds),
    renderStoryboard(video.storyboard),
    renderConversation(video.messages),
    `## Your task\n\n${describeTask(video)}`,
  ]

  return sections.filter(Boolean).join('\n\n')
}

export function buildStoryboardTurnLimitMessage(maxTurns) {
  return `## Turn limit reached

You have used all ${maxTurns} turns of this run, so you cannot call any more tools. Return the storyboard and your reply now, built only from what you have already read.`
}
