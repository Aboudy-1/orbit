type LogoProps = {
  size?: 'sm' | 'md'
}

export default function Logo({ size = 'md' }: LogoProps) {
  const textClass = size === 'sm' ? 'text-lg' : 'text-2xl'

  return (
    <div className="flex items-center gap-2.5">
      <svg
        width={size === 'sm' ? 24 : 32}
        height={size === 'sm' ? 24 : 32}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden
      >
        <circle cx="16" cy="16" r="14" stroke="#01696f" strokeWidth="2" />
        <circle cx="16" cy="16" r="6" fill="#01696f" />
        <circle cx="24" cy="10" r="3" fill="#01696f" />
      </svg>
      <span className={`${textClass} font-bold tracking-tight text-text`}>Orbit</span>
    </div>
  )
}
