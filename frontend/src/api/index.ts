/**
 * LYKA Realty API Module Index
 * Re-exports core API client methods, types, and domain endpoints.
 */
import * as crmApi from '../crm/services/crmApi'
import * as hrmsApi from '../crm/services/hrmsApi'

export * from './client'
export * from '../services/api'
export { crmApi, hrmsApi }
