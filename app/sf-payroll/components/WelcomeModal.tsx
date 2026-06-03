"use client"

import { useEffect, useState } from "react"

interface WelcomeModalProps {
  open?: boolean
  onClose?: () => void
}

export default function WelcomeModal({ open: openProp, onClose: onCloseProp }: WelcomeModalProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false)

  useEffect(() => {
    if (openProp === undefined) {
      const seen = sessionStorage.getItem("payroll-welcome-seen")
      if (!seen) setInternalOpen(true)
    }
  }, [openProp])

  const open = openProp !== undefined ? openProp : internalOpen

  function dismiss() {
    if (onCloseProp) {
      onCloseProp()
    } else {
      sessionStorage.setItem("payroll-welcome-seen", "1")
      setInternalOpen(false)
    }
  }

  if (!open) return null

  return (
    <div className="pay-modal-scrim" onClick={dismiss}>
      <div className="pay-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="pay-modal-head">
          <div className="pay-modal-emoji">💸</div>
          <div>
            <h1 className="pay-modal-title">SF Payroll</h1>
            <p className="pay-modal-sub">San Francisco · 2025 · the public record</p>
          </div>
        </div>

        <div className="pay-modal-body">
          <Row
            icon="🧾"
            title="What this is"
            body="Every person on San Francisco's payroll in 2025 — by name — with what the city paid them. All 42,543 of them. Search, sort, filter. It's a public record; this just makes it readable."
          />
          <Row
            icon="⏱️"
            title="Why overtime is the story"
            body="The city paid $482 million in overtime last year. 410 employees made more in overtime than in their entire base salary. This explorer puts that front and center."
          />
          <Row
            icon="⚖️"
            title="Not a hit list"
            body="Most of this overtime is mandatory — driven by chronic understaffing and minimum-staffing rules. The city's own budget analyst flagged a system with weak controls. The numbers indict the machine, not the people working the shifts."
          />
          <Row
            icon="📂"
            title="Source"
            body="DataSF's Employee Compensation dataset, calendar year 2025. Downloaded once, not live. Names are public for 2017 onward."
          />
        </div>

        <button onClick={dismiss} className="pay-modal-btn">
          Show me the payroll
        </button>
        <p className="pay-modal-fine">
          By Rodin Roohipour. Public data, presented as-is. Not affiliated with the City of San Francisco.
        </p>
      </div>
    </div>
  )
}

function Row({ icon, title, body }: { icon: string; title: string; body: React.ReactNode }) {
  return (
    <div className="pay-modal-row">
      <div className="pay-modal-row-icon">{icon}</div>
      <div>
        <div className="pay-modal-row-title">{title}</div>
        <div className="pay-modal-row-body">{body}</div>
      </div>
    </div>
  )
}
