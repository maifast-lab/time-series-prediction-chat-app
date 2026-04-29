import Image from 'next/image';

import logoImg from '@/app/logo.jpg';

export default function SidebarBrand() {
  return (
    <div className='flex items-center gap-3 px-2'>
      <div className='h-8 w-8 overflow-hidden rounded-lg border border-slate-200 shadow-lg shadow-blue-500/20 dark:border-white/10'>
        <Image
          src={logoImg}
          alt='Maifast Logo'
          className='h-full w-full object-cover'
        />
      </div>
      <span className='bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-xl font-bold text-transparent'>
        Maifast
      </span>
    </div>
  );
}
