"""Cloud Android UI checks with empty inputs; never logs in or submits records."""
import pathlib,re,subprocess,time,xml.etree.ElementTree as ET
output=pathlib.Path('artifacts/android-diagnostics');output.mkdir(parents=True,exist_ok=True)
def adb(*args):return subprocess.check_output(['adb',*args])
def snapshot():
 adb('shell','uiautomator','dump','/sdcard/yakumo-ui.xml')
 data=adb('exec-out','cat','/sdcard/yakumo-ui.xml');(output/'ui.xml').write_bytes(data);return ET.fromstring(data)
def find(predicate):
 for _ in range(10):
  for node in snapshot().iter('node'):
   bounds=re.findall(r'\d+',node.get('bounds',''))
   if len(bounds)==4 and int(bounds[2])>int(bounds[0]) and int(bounds[3])>int(bounds[1]) and predicate(node):return node
  time.sleep(1)
 raise RuntimeError('Expected mobile UI control not found')
def label(value):return find(lambda n:n.get('text')==value or n.get('content-desc')==value or n.get('content-desc','').startswith(value+' '))
def tap(node):
 x1,y1,x2,y2=map(int,re.findall(r'\d+',node.get('bounds')));adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));time.sleep(1)
tap(label('我的'));label('我的空间')
root=snapshot();_,_,width,height=map(int,re.findall(r'\d+',next(root.iter('node')).get('bounds')))
adb('shell','input','swipe',str(width//2),str(height*3//4),str(width//2),str(height//3),'350');time.sleep(1)
tap(label('账号管理'))
tap(label('登录第一个账号'))
adb('shell','settings','put','secure','show_ime_with_hard_keyboard','1')
# Accessibility bounds may be positive while the fixed bottom navigation covers them.
# Scroll the input fully into the content viewport before tapping it.
for _ in range(8):
 root=snapshot()
 nav=[list(map(int,re.findall(r'\d+',n.get('bounds','')))) for n in root.iter('node') if n.get('text')=='移动端导航' or n.get('content-desc')=='移动端导航']
 safe_bottom=min([b[1] for b in nav if len(b)==4 and b[3]>b[1]]+[height])-16
 inputs=[]
 for n in root.iter('node'):
  b=list(map(int,re.findall(r'\d+',n.get('bounds',''))))
  if n.get('class')=='android.widget.EditText' and len(b)==4 and b[0]<b[2] and 80<=b[1]<b[3]<=safe_bottom and b[3]-b[1]>=32:inputs.append(n)
 if inputs:
  tap(inputs[0]);break
 adb('shell','input','swipe',str(width//2),str(safe_bottom-24),str(width//2),str(max(100,height//3)),'350');time.sleep(1)
else:raise RuntimeError('Login input could not be scrolled above bottom navigation')
for _ in range(10):
 keyboard=adb('shell','dumpsys','input_method').decode(errors='replace')
 if re.search(r'(mInputShown|mIsInputViewShown|inputShown)=true',keyboard):break
 time.sleep(1)
else:
 snapshot()
 (output/'keyboard-failure.png').write_bytes(adb('exec-out','screencap','-p'))
 (output/'input-method.txt').write_text(keyboard)
 raise RuntimeError('Software keyboard did not open after visible input tap')
(output/'keyboard.png').write_bytes(adb('exec-out','screencap','-p'))
adb('shell','input','keyevent','4');time.sleep(1)
adb('shell','input','keyevent','4');time.sleep(1)
adb('shell','input','keyevent','4');time.sleep(1)
adb('shell','input','swipe',str(width//2),str(height//3),str(width//2),str(height*3//4),'350');label('我的空间')
(output/'personal-space.png').write_bytes(adb('exec-out','screencap','-p'))
print('Android bottom navigation, account page, software keyboard and system back passed')
