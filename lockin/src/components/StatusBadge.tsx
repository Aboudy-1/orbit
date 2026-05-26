import { STATUS_LABELS, type UserStatus } from '../lib/types'

export default function StatusBadge({ status }: { status: UserStatus }) {
  return <span className="text-sm">{STATUS_LABELS[status]}</span>
}
