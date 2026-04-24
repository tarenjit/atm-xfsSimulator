import { Module } from '@nestjs/common';
import { CassettesController } from './cassettes.controller';
import { XfsModule } from '../xfs/xfs.module';

@Module({
  imports: [XfsModule],
  controllers: [CassettesController],
})
export class CassettesModule {}
