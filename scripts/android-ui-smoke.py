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
tap(label('我的'));label('我的空间');tap(label('账号管理'))
adb('shell','settings','put','secure','show_ime_with_hard_keyboard','1')
tap(find(lambda n:n.get('class')=='android.widget.EditText'))
time.sleep(2)
keyboard=adb('shell','dumpsys','input_method').decode(errors='replace')
if not re.search(r'(mInputShown|mIsInputViewShown|inputShown)=true',keyboard):raise RuntimeError('Software keyboard did not open')
(output/'keyboard.png').write_bytes(adb('exec-out','screencap','-p'))
adb('shell','input','keyevent','4');time.sleep(1)
adb('shell','input','keyevent','4');label('我的空间')
(output/'personal-space.png').write_bytes(adb('exec-out','screencap','-p'))
print('Android bottom navigation, account page, software keyboard and system back passed')
