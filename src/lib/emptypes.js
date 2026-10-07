// Loại nhân sự: Quản lý / Hành chính / Công nhân (Kíp, Trưởng ca chỉ áp dụng cho Công nhân)
const EMP_TYPES = { manager: 'Quản lý', admin: 'Hành chính', worker: 'Công nhân' };
const isEmpType = t => Object.prototype.hasOwnProperty.call(EMP_TYPES, t);
const empTypeName = t => EMP_TYPES[t] || EMP_TYPES.worker;
module.exports = { EMP_TYPES, isEmpType, empTypeName };
