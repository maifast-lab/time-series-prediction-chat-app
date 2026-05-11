import Image from 'next/image';

export default function SidebarBrand() {
  return (
    <div className='flex items-center justify-center gap-3 px-2'>
      <Image
        src='/PNG.png'
        width={100}
        height={30}
        alt='Maifast Logo'
        className='h-10 w-100 shrink-0 object-contain'
        quality={100}
        priority
        sizes='40px'
      />
    </div>
  );
}
