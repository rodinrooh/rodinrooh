export interface MeterTransaction {
  id: string
  transmission_datetime: string
  post_id: string
  street_block: string
  payment_type: string
  session_start_dt: string
  gross_paid_amt: number
  meter_event_type: string
  lat: number | null
  lng: number | null
  geocoded: boolean
  created_at: string
}
