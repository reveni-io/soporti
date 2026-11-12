import Icon from '../../../common/Icon/Icon.jsx'
import { EXAMPLE_PROMPTS } from '../example-prompts.js'
import './EmptyDashboard.css'

const GHOST_TILES = [
  { name: 'wide', icon: 'chart' },
  { name: 'tall', icon: 'chart-pie' },
  { name: 'low', icon: 'chart-line' },
]

export default function EmptyDashboard({ onPickExample }) {
  return (
    <section className="empty-dashboard">
      <div className="empty-dashboard__ghost" aria-hidden="true">
        {GHOST_TILES.map(tile => (
          <div key={tile.name} className={`empty-dashboard__tile empty-dashboard__tile--${tile.name}`}>
            <Icon name={tile.icon} size={28} strokeWidth={1.5} />
          </div>
        ))}
      </div>

      <div className="empty-dashboard__message">
        <h2 className="empty-dashboard__title">Your dashboard starts with a question.</h2>
        <p className="empty-dashboard__text">
          Describe a chart in plain words. Soporti explores the database, writes the SQL and draws it — then drag,
          resize and edit every card.
        </p>

        <ul className="empty-dashboard__examples">
          {EXAMPLE_PROMPTS.map(prompt => (
            <li key={prompt}>
              <button
                type="button"
                className="chip chip--pill empty-dashboard__example"
                onClick={() => onPickExample(prompt)}
              >
                {prompt}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
