export interface Tow {
  id: number
  vehicle_id: number
  tr_number: string | null
  license: string | null
  state: string | null
  color: string | null
  year: number | null
  make: string | null
  model: string | null
  vin_last4: string | null
  towed_at: string
  towed_by: string | null
  towed_from: string | null
  reason: string | null
  status: string | null
  tow_company: string | null
  tow_company_address: string | null
  lat: number | null
  lng: number | null
  created_at: string
}
