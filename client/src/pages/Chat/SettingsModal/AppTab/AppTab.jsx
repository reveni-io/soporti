import { useInstallPrompt } from '../../hooks/useInstallPrompt/useInstallPrompt.js'
import './AppTab.css'

const DENIED = 'denied'

export default function AppTab({ push }) {
  const installPrompt = useInstallPrompt()

  return (
    <div className="settings-modal__panel app-tab">
      <p className="settings-modal__description">
        Use Soporti as an app on this device and let it tell you when something you asked for is ready.
      </p>

      <section className="card app-tab__section" aria-labelledby="app-tab-install">
        <h4 id="app-tab-install" className="app-tab__title">
          Install Soporti
        </h4>
        <InstallStatus
          canInstall={installPrompt.canInstall}
          isInstalled={installPrompt.isInstalled}
          wasInstalled={installPrompt.wasInstalled}
          isIos={installPrompt.isIos}
          onInstall={installPrompt.install}
        />
      </section>

      <section className="card app-tab__section" aria-labelledby="app-tab-notifications">
        <div className="app-tab__head">
          <h4 id="app-tab-notifications" className="app-tab__title">
            Notifications on this device
          </h4>
          <span className={push.isSubscribed ? 'badge badge--success' : 'badge'}>
            {push.isSubscribed ? 'On' : 'Off'}
          </span>
        </div>
        <p className="app-tab__help">
          Get notified when a bot routine posts a report, a scheduled question is answered, an answer finishes after you
          leave, or a video is ready.
        </p>
        <NotificationStatus push={push} />
        {push.error && <p className="alert alert--error">{push.error}</p>}
      </section>
    </div>
  )
}

function InstallStatus({ canInstall, isInstalled, wasInstalled, isIos, onInstall }) {
  if (isInstalled) return <p className="note">You&apos;re using the installed app.</p>
  if (wasInstalled) return <p className="note">Soporti is installed. Open it from your home screen or app launcher.</p>

  if (canInstall) {
    return (
      <>
        <p className="app-tab__help">
          Open Soporti in its own window from your home screen, dock or taskbar, and share screenshots and files to it
          from other apps.
        </p>
        <div className="app-tab__actions">
          <button className="btn btn--primary" type="button" onClick={onInstall}>
            Install
          </button>
        </div>
      </>
    )
  }

  if (isIos) {
    return (
      <p className="app-tab__help">
        Open Soporti in Safari, tap <strong>Share</strong> and choose <strong>Add to Home Screen</strong>.
      </p>
    )
  }

  return (
    <p className="app-tab__help">
      Use the install icon in your browser&apos;s address bar or its menu. In Safari on a Mac, choose{' '}
      <strong>File → Add to Dock</strong>.
    </p>
  )
}

function NotificationStatus({ push }) {
  if (push.needsInstall) {
    return (
      <p className="note">
        On iPhone and iPad, notifications only work in the installed app. Add Soporti to your Home Screen, open it from
        there and turn them on.
      </p>
    )
  }
  if (push.isChecking) return <p className="app-tab__help">Checking this device…</p>
  if (!push.isSupported) {
    return <p className="note">This browser can&apos;t receive notifications from Soporti.</p>
  }
  if (push.permission === DENIED) {
    return (
      <p className="note">
        Notifications are blocked for Soporti. Allow them in your browser&apos;s site settings (the icon next to the
        address bar), then reload the page.
      </p>
    )
  }

  if (!push.isSubscribed) {
    return (
      <div className="app-tab__actions">
        <button className="btn btn--primary" type="button" onClick={push.enable} disabled={push.isBusy}>
          Turn on
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="app-tab__actions">
        <button className="btn btn--secondary" type="button" onClick={push.sendTest} disabled={push.isBusy}>
          Send a test notification
        </button>
        <button className="btn btn--secondary" type="button" onClick={push.disable} disabled={push.isBusy}>
          Turn off
        </button>
      </div>
      {push.testResult && (
        <p className="app-tab__result" role="status">
          {push.testResult}
        </p>
      )}
    </>
  )
}
