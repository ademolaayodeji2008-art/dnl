import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import voucherRoutes from './routes/vouchers.js';
import reportRoutes from './routes/reports.js';
import settingsRoutes from './routes/settings.js';
import customerRoutes from './routes/customers.js';
import salesRoutes from './routes/sales.js';
import inventoryRoutes from './routes/inventory.js';
import chequeRoutes from './routes/cheques.js';
import bankingRoutes from './routes/banking.js';
import purchasingRoutes from './routes/purchasing.js';
import returnsRoutes from './routes/returns.js';
import locationRoutes from './routes/locations.js';
import dataRoutes from './routes/data.js';
import businessReportRoutes from './routes/business-reports.js';
import documentRoutes from './routes/documents.js';
import accountingRoutes from './routes/accounting.js';
import accountingReportRoutes from './routes/accounting-reports.js';
import bankReconciliationRoutes from './routes/bank-reconciliation.js';
import controlRoutes from './routes/controls.js';
import budgetRoutes from './routes/budgets.js';
import batchRoutes from './routes/batches.js';
import sessionRoutes from './routes/sessions.js';

if(!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required.');

const app=express();
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:false,crossOriginResourcePolicy:{policy:'same-site'}}));
app.use('/api/auth/login',rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-8',legacyHeaders:false}));
app.use('/api/',rateLimit({windowMs:60*1000,limit:300,standardHeaders:'draft-8',legacyHeaders:false}));
app.set('trust proxy',1);
const origins=String(process.env.CORS_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
app.use(cors({origin:(origin,cb)=>!origin||!origins.length||origins.includes(origin)?cb(null,true):cb(new Error('Origin not allowed by CORS')),credentials:false}));
app.use(compression());
app.use(express.json({limit:'5mb'}));
app.use(rateLimit({windowMs:15*60*1000,limit:500,standardHeaders:'draft-8',legacyHeaders:false}));

app.use('/api/auth',authRoutes);
app.use('/api/admin',adminRoutes);
app.use('/api/vouchers',voucherRoutes);
app.use('/api/reports',reportRoutes);
app.use('/api/settings',settingsRoutes);
app.use('/api/customers',customerRoutes);
app.use('/api/sales',salesRoutes);
app.use('/api/inventory',inventoryRoutes);
app.use('/api/cheques',chequeRoutes);
app.use('/api/banking',bankingRoutes);
app.use('/api/purchasing',purchasingRoutes);
app.use('/api/returns',returnsRoutes);
app.use('/api/locations',locationRoutes);
app.use('/api/data',dataRoutes);
app.use('/api/business-reports',businessReportRoutes);
app.use('/api/documents',documentRoutes);
app.use('/api/accounting',accountingRoutes);
app.use('/api/accounting-reports',accountingReportRoutes);
app.use('/api/bank-reconciliation',bankReconciliationRoutes);
app.use('/api/controls',controlRoutes);
app.use('/api/budgets',budgetRoutes);
app.use('/api/batches',batchRoutes);
app.use('/api/sessions',sessionRoutes);

const __dirname=path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname,'public'),{
  maxAge:0,
  etag:false,
  lastModified:false,
  setHeaders:(res)=>{
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma','no-cache');
    res.setHeader('Expires','0');
  }
}));
app.get('/*splat',(req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});
app.use((err,req,res,next)=>{
  console.error(err);
  res.status(err.status||500).json({message:err.message||'Unexpected server error.'});
});

app.listen(process.env.PORT||3000,()=>console.log(`Dariltweens Business & Payment Control System running on port ${process.env.PORT||3000}`));
