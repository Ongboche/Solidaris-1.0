import { z } from 'zod'

// Messages are i18n keys, translated where they are shown.
const email = z.string().trim().email('auth.validation.email')
const password = z.string().min(10, 'auth.validation.passwordLength')
const requiredText = z.string().trim().min(1, 'auth.validation.required')

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'auth.validation.required'),
})
export type SignInValues = z.infer<typeof signInSchema>

export const consentSchema = z.object({
  processing: z.literal(true, { errorMap: () => ({ message: 'auth.validation.consentRequired' }) }),
  handling: z.literal(true, { errorMap: () => ({ message: 'auth.validation.consentRequired' }) }),
  emailConsent: z.boolean(),
})
export type ConsentValues = z.infer<typeof consentSchema>

// Registration fields follow SRS §5.5, except Role: roles come only by invitation (PLAN D-25).
export const signUpSchema = z
  .object({
    fullName: requiredText,
    email,
    institution: requiredText,
    position: requiredText,
    country: requiredText,
    discipline: requiredText,
    password,
    confirmPassword: z.string(),
  })
  .merge(consentSchema)
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'auth.validation.passwordMatch',
  })
export type SignUpValues = z.infer<typeof signUpSchema>

export const forgotSchema = z.object({ email })

export const newPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'auth.validation.passwordMatch',
  })

export const profileSchema = z.object({
  fullName: requiredText,
  institution: requiredText,
  position: requiredText,
  country: requiredText,
  discipline: requiredText,
  orcid: z
    .string()
    .trim()
    .regex(/^(\d{4}-){3}\d{3}[\dX]$|^$/, 'auth.validation.required')
    .optional(),
})
export type ProfileValues = z.infer<typeof profileSchema>
