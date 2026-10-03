import { managementToken } from '@datalom/shared/runtime/config';
const token = managementToken();
if (!token) throw new Error('请设置 DATALOM_MANAGEMENT_TOKEN；也可直接使用管理员邮箱密码登录');
console.log(token);
