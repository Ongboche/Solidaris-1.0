import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RatingButtons } from './RatingButtons'
import { JourneyBar } from './JourneyBar'
import { Button } from './Button'
import { TextField } from './Field'

const levels = [
  { value: 1, label: 'Emerging / Minimal' },
  { value: 2, label: 'Partial / Inconsistent' },
  { value: 3, label: 'Moderate / Developing' },
  { value: 4, label: 'Strong / Consistent' },
  { value: 5, label: 'Transformative / Exemplary' },
] as const

describe('RatingButtons (brief §9.7)', () => {
  it('offers five labelled choices, no slider, and shows "Not rated" when empty', () => {
    render(<RatingButtons domainName="Equity & Justice" levels={[...levels]} value={null} onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'Rating for Equity & Justice' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(5)
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.getByText('Not rated')).toBeInTheDocument()
  })

  it('selects by keyboard and can be cleared back to null, never 0', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <RatingButtons domainName="D1" levels={[...levels]} value={null} onChange={onChange} />,
    )
    await userEvent.click(screen.getByRole('radio', { name: /Strong/ }))
    expect(onChange).toHaveBeenLastCalledWith(4)
    rerender(<RatingButtons domainName="D1" levels={[...levels]} value={4} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Clear rating' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})

describe('JourneyBar (brief §9.1)', () => {
  it('states each gate status in text, not only colour', () => {
    render(<JourneyBar current="G2" passed={['G0', 'G1']} onHold />)
    const current = screen.getByText('G2').closest('li')!
    expect(current).toHaveAttribute('aria-current', 'step')
    expect(current).toHaveTextContent('on hold')
    expect(screen.getByText('G0').closest('li')).toHaveTextContent('passed')
    expect(screen.getByText('G8').closest('li')).toHaveTextContent('not started')
  })
})

describe('Button (brief §9.4)', () => {
  it('explains why it is disabled', () => {
    render(
      <Button id="submit" disabled disabledReason="You can submit once D3 has a narrative">
        Submit
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Submit' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('You can submit once D3 has a narrative')
  })
})

describe('TextField', () => {
  it('links label, hint and error for screen readers', () => {
    render(<TextField label="Password" hint="At least 10 characters." error="Use at least 10 characters." />)
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('At least 10 characters. Use at least 10 characters.')
  })
})
