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
      const skip = new URLSearchParams(window.location.search).has("skipintro")
      const seen = sessionStorage.getItem("payroll-welcome-seen")
      if (!seen && !skip) setInternalOpen(true)
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
        <h1 className="pay-modal-title">SF Payroll</h1>
        <p className="pay-modal-sub">Everyone on San Francisco&apos;s payroll in 2025, by name.</p>

        <div className="pay-modal-body">
          <p>
            All 42,543 of them — what the city paid each person, and the overtime that paid hundreds of them more
            than their salary. It&apos;s a public record; this just makes it readable.
          </p>
          <p>
            Most of this overtime is mandatory: chronic understaffing, minimum-staffing rules, and a system the
            city&apos;s own budget analyst flagged for weak controls. The numbers are evidence of the machine — not
            an accusation against the people working the shifts.
          </p>
          <p className="pay-modal-src">
            Source: DataSF Employee Compensation, calendar year 2025. Names are public for 2017 onward.
          </p>
        </div>

        <button onClick={dismiss} className="pay-modal-btn">
          Show me the payroll
        </button>
        <p className="pay-modal-fine">By Rodin Roohipour. Not affiliated with the City of San Francisco.</p>
      </div>
    </div>
  )
}
