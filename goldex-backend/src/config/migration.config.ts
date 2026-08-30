import { DataSource } from 'typeorm';
import { typeormConfig } from './typeorm.config';

const datasource = new DataSource(typeormConfig());
datasource.initialize();
export default datasource;
