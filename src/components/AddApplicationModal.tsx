"use client"

import { useState } from "react"
import { X, Plus, Building, Briefcase, Globe, Mail, DollarSign } from "lucide-react"
import { createApplication } from "@/lib/api-client"
import type { WorkplaceType, ApplicationStatus, ApplicationMethod, PriorityLevel } from "@/types"

interface AddApplicationModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}

export function AddApplicationModal({ isOpen, onClose, onCreated }: AddApplicationModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [company, setCompany] = useState("")
  const [workplaceType, setWorkplaceType] = useState<WorkplaceType>("remote")
  const [status, setStatus] = useState<ApplicationStatus>("applied")
  const [applicationMethod, setApplicationMethod] = useState<ApplicationMethod>("portal")
  const [location, setLocation] = useState("")
  const [url, setUrl] = useState("")
  const [salary, setSalary] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [priority, setPriority] = useState<PriorityLevel>("medium")
  const [jobDescription, setJobDescription] = useState("")
  const [infoProvided, setInfoProvided] = useState("")
  const [coverLetter, setCoverLetter] = useState("")

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !company.trim()) {
      setError("Title and Company are required")
      return
    }

    setLoading(true)
    setError(null)

    try {
      await createApplication({
        title: title.trim(),
        company: company.trim(),
        workplace_type: workplaceType,
        status,
        application_method: applicationMethod,
        location: location.trim(),
        url: url.trim(),
        salary: salary.trim(),
        contact_email: contactEmail.trim(),
        priority,
        job_description: jobDescription.trim(),
        info_provided: infoProvided.trim(),
        cover_letter: coverLetter.trim(),
        applied_at: new Date().toISOString(),
      })

      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-2xl my-2 sm:my-8 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 sm:px-6 py-3.5 sm:py-4 shrink-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
              <Plus className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-fg)]">New application</h2>
              <p className="text-2xs text-[var(--color-faint)]">Record position details, cover letter, and submission info</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--color-faint)] hover:bg-[var(--color-surface-hi)] hover:text-[var(--color-fg)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="rounded border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 p-3 text-xs text-[var(--color-danger)]">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="mb-1.5 block text-2xs text-[var(--color-faint)]">Job title</label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-faint)]" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Backend Engineer"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 pl-9 pr-3 text-xs text-[var(--color-fg)] placeholder-[var(--color-faint)] focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-2xs text-[var(--color-faint)]">Company</label>
              <div className="relative">
                <Building className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-faint)]" />
                <input
                  type="text"
                  required
                  placeholder="e.g. GN Hearing, Resend, Bytex"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 pl-9 pr-3 text-xs text-[var(--color-fg)] placeholder-[var(--color-faint)] focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label className="mb-1.5 block text-2xs text-[var(--color-faint)]">Workplace</label>
              <select
                value={workplaceType}
                onChange={(e) => setWorkplaceType(e.target.value as WorkplaceType)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 px-3 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="on-site">On-site</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-2xs text-[var(--color-faint)]">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 px-3 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="applied">Applied</option>
                <option value="wishlist">Wishlist / Draft</option>
                <option value="interview_pending">Interview Pending</option>
                <option value="interviewing">Interviewing</option>
                <option value="technical_assessment">Technical Assessment</option>
                <option value="offer">Offer Received</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-2xs text-[var(--color-faint)]">How you applied</label>
              <select
                value={applicationMethod}
                onChange={(e) => setApplicationMethod(e.target.value as ApplicationMethod)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 px-3 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="portal">Portal (Greenhouse / Lever / etc)</option>
                <option value="email">Email</option>
                <option value="linkedin">LinkedIn</option>
                <option value="referral">Referral</option>
                <option value="recruiter">Recruiter</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label className="mb-1.5 block text-2xs text-[var(--color-faint)]">Location</label>
              <input
                type="text"
                placeholder="e.g. Amsterdam, NL / Remote"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 px-3 text-xs text-[var(--color-fg)] placeholder-[var(--color-faint)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-2xs text-[var(--color-faint)]">Salary</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-faint)]" />
                <input
                  type="text"
                  placeholder="e.g. €75,000 / €7,500/mo"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 pl-9 pr-3 text-xs text-[var(--color-fg)] placeholder-[var(--color-faint)] focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-2xs text-[var(--color-faint)]">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 px-3 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="top">Top Priority (⭐)</option>
                <option value="high">High Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="low">Low Priority</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="mb-1.5 block text-2xs text-[var(--color-faint)]">Job posting URL</label>
              <div className="relative">
                <Globe className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-faint)]" />
                <input
                  type="url"
                  placeholder="https://..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 pl-9 pr-3 text-xs text-[var(--color-fg)] placeholder-[var(--color-faint)] focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-2xs text-[var(--color-faint)]">Contact email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-faint)]" />
                <input
                  type="text"
                  placeholder="e.g. recruiter@company.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 pl-9 pr-3 text-xs text-[var(--color-fg)] placeholder-[var(--color-faint)] focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-2xs text-[var(--color-faint)]">What you sent them</label>
            <textarea
              rows={2}
              placeholder="e.g. CV: example-cv.pdf, Notice: immediate, Expected salary: €70k"
              value={infoProvided}
              onChange={(e) => setInfoProvided(e.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-fg)] placeholder-[var(--color-faint)] focus:border-[var(--color-accent)] focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-2xs text-[var(--color-faint)]">Cover letter</label>
            <textarea
              rows={4}
              placeholder="Paste cover letter markdown or text here..."
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-fg)] placeholder-[var(--color-faint)] focus:border-[var(--color-accent)] focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-2xs text-[var(--color-faint)]">Job description</label>
            <textarea
              rows={4}
              placeholder="Paste job description, requirements, tech stack..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-fg)] placeholder-[var(--color-faint)] focus:border-[var(--color-accent)] focus:outline-none font-mono"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-line)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[var(--color-line)] px-4 py-2 text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-hi)] hover:text-[var(--color-fg)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-[#0b0c0f] hover:bg-[var(--color-accent)]/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Saving..." : "Create Application"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
