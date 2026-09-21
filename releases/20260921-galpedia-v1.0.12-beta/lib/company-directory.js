
export {buildCompanyDirectory,serializeCompanySummary,restoreCompanySummary,searchCompanyDirectory} from './company-directory-baseline.js';
import {worksForCompany as original} from './company-directory-baseline.js';
import {worksForReviewedCompany} from './company-reviewed-runtime.js';
export const worksForCompany=(model,id,options)=>model.reviewedCompanyLists?worksForReviewedCompany(model,id,options):original(model,id,options);
