import BotAvatar from '../../../common/BotAvatar/BotAvatar.jsx'
import './BotsIntro.css'

const EMPTY_AVATAR_SEED = 'soporti-bots'
const EMPTY_AVATAR_SIZE = 72
const PICK_AVATAR_SIZE = 48
const PICK_AVATAR_LIMIT = 4

export default function BotsIntro({ bots, loading, error, onCreate }) {
  if (loading) return <section className="bots-intro" />
  if (bots.length === 0 && error) return <section className="bots-intro" />
  if (bots.length === 0) return <BotsExplainer onCreate={onCreate} />

  return (
    <section className="bots-intro">
      <div className="bots-intro__avatars" aria-hidden="true">
        {bots.slice(0, PICK_AVATAR_LIMIT).map(bot => (
          <BotAvatar
            key={bot.id}
            seed={bot.avatarSeed}
            avatarStyle={bot.avatarStyle}
            size={PICK_AVATAR_SIZE}
            className="bots-intro__avatar"
          />
        ))}
      </div>
      <h2 className="bots-intro__title">Pick a bot</h2>
      <p className="bots-intro__text">Choose one from the list to open its chat. The others stay one click away.</p>
    </section>
  )
}

function BotsExplainer({ onCreate }) {
  return (
    <section className="bots-intro">
      <BotAvatar seed={EMPTY_AVATAR_SEED} size={EMPTY_AVATAR_SIZE} />
      <h2 className="bots-intro__title">Your own assistants</h2>
      <p className="bots-intro__text">
        A bot is a private assistant with a job you describe. It works with every connected tool, keeps one ongoing chat
        with you, and can run routines on its own, like reviewing the new tickets every weekday at 17:00 and telling you
        what it found.
      </p>
      <button type="button" className="btn btn--primary" onClick={onCreate}>
        Create a bot
      </button>
    </section>
  )
}
