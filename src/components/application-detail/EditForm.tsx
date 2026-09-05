"use client"

import { useState } from "react"
import type { Application, ApplicationStatus, WorkplaceType } from "@/types"

interface EditFormProps {
  application: Application
  /** Rejecting leaves the form as the user left it, so nothing is retyped. */
  onSave: (patch: Partial<Application>) => Promise<void>
  onCancel: () => void
  saving: boolean
}

const STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: "wishlist", label: "Wishlist" },
  { value: "applied", label: "Applied" },
  { value: "interview_pending", label: "Interview pending" },
  { value: "interviewing", label: "Interviewing" },
  { value: "technical_assessment", label: "Technical assessment" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
]

const WORKPLACES: { value: WorkplaceType; label: string }[] = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "on-site", label: "On-site" },
]

const inputClass =
  "w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 px-3 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
const areaClass =
  "w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2.5 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none font-mono"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-[var(--color-faint)]">{label}</span>
      {children}
    </label>
  )
}

/**
 * Seeded from the application once, at mount. The shell keys this component on
 * the application id, so opening a different one remounts it with fresh values
 * — which is what removed the copy-props-into-state effect the modal used to
 * run on every load.
 *
 * `info_provided` has no control here and is deliberately left out of the
 * patch: an omitted field is not written, so it survives a save untouched
 * instead of being round-tripped through a stale copy.
 */
export function EditForm({ application, onSave, onCancel, saving }: EditFormProps) {
  const [title, setTitle] = useState(application.title || "")
  const [company, setCompany] = useState(application.company || "")
  const [status, setStatus] = useState<ApplicationStatus>(application.status || "applied")
  const [workplace, setWorkplace] = useState<WorkplaceType>(application.workplace_type || "remote")
  const [location, setLocation] = useState(application.location || "")
  const [salary, setSalary] = useState(application.salary || "")
  const [url, setUrl] = useState(application.url || "")
  const [contactEmail, setContactEmail] = useState(application.contact_email || "")
  const [notes, setNotes] = useState(application.notes || "")
  const [coverLetter, setCoverLetter] = useState(application.cover_letter || "")
  const [jobDescription, setJobDescription] = useState(application.job_description || "")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSave({
      title: title.trim(),
      company: company.trim(),
      status,
      workplace_type: workplace,
      location: location.trim(),
      salary: salary.trim(),
      url: url.trim(),
      contact_email: contactEmail.trim(),
      notes: notes.trim(),
      cover_letter: coverLetter.trim(),
      job_description: jobDescription.trim(),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Job title">
          <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Company">
          <input type="text" required value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Workplace">
          <select
            value={workplace}
            onChange={(e) => setWorkplace(e.target.value as WorkplaceType)}
            className={inputClass}
          >
            {WORKPLACES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
            className={inputClass}
          >
            {STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location">
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Salary">
          <input type="text" value={salary} onChange={(e) => setSalary(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Job posting URL">
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Contact email">
          <input
            type="text"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={areaClass} />
      </Field>

      <Field label="Cover letter">
        <textarea
          rows={4}
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          className={areaClass}
        />
      </Field>

      <Field label="Job description">
        <textarea
          rows={4}
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          className={areaClass}
        />
      </Field>

      <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-line)]">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface-hi)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[#0b0c0f] hover:bg-[var(--color-accent)]/90 disabled:opacity-50"
        >
          {saving ? "Saving" : "Save changes"}
        </button>
      </div>
    </form>
  )
}
