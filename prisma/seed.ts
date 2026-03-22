import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import * as bcrypt from 'bcryptjs';

// DBファイルはプロジェクトルート直下の dev.db
const adapter = new PrismaBetterSqlite3({ url: 'file:./dev.db' });
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('🌱 シードデータを投入中...');

    // 1. 組織（保育園）の作成
    const org = await prisma.organization.create({
        data: {
            name: 'さくら保育園',
            themeColor: '#E8719F',
            accentColor: '#D4956A',
            closingDay: 10,
        },
    });
    console.log('✅ 組織作成:', org.name);

    // 2. 設定マスタ（システムの各種設定値）の作成
    const settings = [
        { key: 'closing_day', value: '10', description: '月の締め日' },
        { key: 'overtime_unit_minutes', value: '15', description: '残業の丸め単位（分）' },
        { key: 'overtime_rounding', value: 'floor', description: '丸め方向' },
        { key: 'meal_unit_price', value: '300', description: '食事代単価（円）' },
        { key: 'standard_work_hours', value: '7.75', description: '所定労働時間' },
        { key: 'break_threshold_hours', value: '6', description: '休憩控除発生の拘束時間' },
        { key: 'break_deduction_hours', value: '0.75', description: '休憩控除時間（45分）' },
        { key: 'overtime_threshold_time', value: '17:30', description: '残業発生の時刻条件' },
        { key: 'short_time_end', value: '16:30', description: '時短定時退勤時刻' },
        { key: 'sick_leave_max_days', value: '3', description: '感染症特休の上限日数' },
        { key: 'theme_primary_color', value: '#E8719F', description: 'テーマカラー' },
        { key: 'theme_accent_color', value: '#D4956A', description: 'アクセントカラー' },
        { key: 'overtime_reasons', value: JSON.stringify(['保護者対応', '行事準備', '書類作成', '会議', 'その他']), description: '残業理由カテゴリ' },
    ];

    for (const s of settings) {
        await prisma.settingMaster.create({
            data: { orgId: org.id, ...s },
        });
    }
    console.log('✅ 設定マスタ作成:', settings.length, '件');

    // 3. サンプル職員の作成（テスト用。パスワードは全員 "password123"）
    const passwordHash = await bcrypt.hash('password123', 10);

    const staffData = [
        { employeeNo: '001', name: '管理者（園長）', email: 'admin@example.com', employmentType: 'REGULAR', role: 'ADMIN', defaultStart: '08:30', defaultEnd: '17:30' },
        { employeeNo: '002', name: '山田花子', email: 'yamada@example.com', employmentType: 'REGULAR', role: 'STAFF', defaultStart: '08:30', defaultEnd: '17:30' },
        { employeeNo: '003', name: '佐藤太郎', email: 'sato@example.com', employmentType: 'REGULAR', role: 'STAFF', defaultStart: '08:30', defaultEnd: '17:30' },
        { employeeNo: '101', name: '鈴木一子', email: 'suzuki@example.com', employmentType: 'SHORT_TIME', role: 'STAFF', defaultStart: '09:00', defaultEnd: '16:30' },
        { employeeNo: '102', name: '田中三子', email: 'tanaka@example.com', employmentType: 'SHORT_TIME', role: 'STAFF', defaultStart: '09:00', defaultEnd: '16:30' },
        { employeeNo: '201', name: '名古屋四郎', email: 'nagoya@example.com', employmentType: 'PART_TIME', role: 'STAFF', defaultStart: '09:00', defaultEnd: '15:00' },
        { employeeNo: '202', name: '大阪五郎', email: 'osaka@example.com', employmentType: 'PART_TIME', role: 'STAFF', defaultStart: '09:00', defaultEnd: '14:00' },
    ];

    for (const s of staffData) {
        await prisma.staff.create({
            data: { orgId: org.id, passwordHash, ...s },
        });
    }
    console.log('✅ 職員作成:', staffData.length, '名');

    // 4. 有休残高の初期設定（正規・時短=20日、パート=10日）
    const allStaff = await prisma.staff.findMany();
    for (const s of allStaff) {
        const totalDays = s.employmentType === 'PART_TIME' ? 10 : 20;
        await prisma.leaveBalance.create({
            data: {
                staffId: s.id,
                fiscalYear: 2026,
                totalDays,
                usedDays: 0,
                remainingDays: totalDays,
            },
        });
    }
    console.log('✅ 有休残高初期設定完了');

    console.log('🎉 シード完了！');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
