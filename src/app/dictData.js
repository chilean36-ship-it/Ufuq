// 500 most useful English words with Uzbek meanings. Format per line: word|part of speech|Uzbek meaning
const RAW = `
a|det|bitta, bir
the|det|(aniq artikl)
I|pron|men
you|pron|sen, siz
he|pron|u (erkak)
she|pron|u (ayol)
it|pron|u, bu (narsa)
we|pron|biz
they|pron|ular
me|pron|meni, menga
him|pron|uni, unga (erkak)
her|pron|uni, unga (ayol); uning
us|pron|bizni, bizga
them|pron|ularni, ularga
my|det|mening
your|det|sening, sizning
his|det|uning (erkak)
our|det|bizning
their|det|ularning
this|det|bu
that|det|o'sha, shu
these|det|bular
those|det|o'shalar
who|pron|kim
what|pron|nima
which|pron|qaysi
where|adv|qayerda
when|adv|qachon
why|adv|nega
how|adv|qanday
and|conj|va
or|conj|yoki
but|conj|lekin
because|conj|chunki
if|conj|agar
so|conj|shuning uchun, juda
than|conj|qaraganda
while|conj|-ganda, paytda
in|prep|ichida, -da
on|prep|ustida, -da
at|prep|-da (joy, vaqt)
to|prep|-ga, -ga qadar
from|prep|-dan
with|prep|bilan
without|prep|-siz
for|prep|uchun
of|prep|-ning
about|prep|haqida
into|prep|ichiga
over|prep|ustidan
under|prep|tagida
between|prep|o'rtasida
before|prep|oldin
after|prep|keyin
during|prep|davomida
through|prep|orqali
against|prep|qarshi
near|prep|yaqinida
be|v|bo'lmoq
have|v|ega bo'lmoq
do|v|qilmoq
say|v|aytmoq
go|v|bormoq
come|v|kelmoq
get|v|olmoq
make|v|yasamoq, qilmoq
know|v|bilmoq
think|v|o'ylamoq
see|v|ko'rmoq
look|v|qaramoq
want|v|xohlamoq
give|v|bermoq
take|v|olmoq, ushlamoq
find|v|topmoq
tell|v|aytib bermoq
ask|v|so'ramoq
answer|v|javob bermoq
work|v|ishlamoq
play|v|o'ynamoq
try|v|urinib ko'rmoq
use|v|ishlatmoq
need|v|kerak bo'lmoq
feel|v|his qilmoq
become|v|bo'lib qolmoq
leave|v|tark etmoq
put|v|qo'ymoq
mean|v|anglatmoq
keep|v|saqlamoq
let|v|ruxsat bermoq
begin|v|boshlamoq
start|v|boshlanmoq, boshlamoq
show|v|ko'rsatmoq
hear|v|eshitmoq
listen|v|quloq solmoq
talk|v|gaplashmoq
speak|v|gapirmoq
read|v|o'qimoq
write|v|yozmoq
learn|v|o'rganmoq
teach|v|o'rgatmoq
study|v|o'qimoq, o'rganmoq
understand|v|tushunmoq
remember|v|eslamoq
forget|v|unutmoq
help|v|yordam bermoq
call|v|chaqirmoq, qo'ng'iroq qilmoq
move|v|siljimoq, ko'chmoq
live|v|yashamoq
believe|v|ishonmoq
bring|v|olib kelmoq
happen|v|sodir bo'lmoq
stand|v|turmoq
sit|v|o'tirmoq
run|v|yugurmoq
walk|v|yurmoq
eat|v|yemoq
drink|v|ichmoq
sleep|v|uxlamoq
wake|v|uyg'onmoq
open|v|ochmoq
close|v|yopmoq
buy|v|sotib olmoq
sell|v|sotmoq
pay|v|to'lamoq
cost|v|turmoq (narxi)
send|v|yubormoq
receive|v|qabul qilmoq
wait|v|kutmoq
meet|v|uchrashmoq
love|v|sevmoq
like|v|yoqtirmoq
hate|v|yomon ko'rmoq
hope|v|umid qilmoq
wish|v|tilamoq
choose|v|tanlamoq
decide|v|qaror qilmoq
change|v|o'zgartirmoq
follow|v|ergashmoq
carry|v|ko'tarib yurmoq
build|v|qurmoq
break|v|sindirmoq
cut|v|kesmoq
cook|v|pishirmoq
wash|v|yuvmoq
clean|v|tozalamoq
fall|v|yiqilmoq
grow|v|o'smoq
win|v|yutmoq
lose|v|yo'qotmoq, yutqazmoq
save|v|saqlab qolmoq
stop|v|to'xtamoq
turn|v|burilmoq
pull|v|tortmoq
push|v|itarmoq
throw|v|otmoq
catch|v|ushlamoq
hold|v|ushlab turmoq
join|v|qo'shilmoq
visit|v|tashrif buyurmoq
travel|v|sayohat qilmoq
arrive|v|yetib kelmoq
return|v|qaytmoq
enter|v|kirmoq
fly|v|uchmoq
drive|v|haydamoq
ride|v|minmoq
swim|v|suzmoq
sing|v|kuylamoq
dance|v|raqsga tushmoq
laugh|v|kulmoq
cry|v|yig'lamoq
smile|v|jilmaymoq
shout|v|baqirmoq
agree|v|rozi bo'lmoq
explain|v|tushuntirmoq
describe|v|ta'riflamoq
check|v|tekshirmoq
prepare|v|tayyorlamoq
finish|v|tugatmoq
continue|v|davom etmoq
plan|v|rejalashtirmoq
create|v|yaratmoq
add|v|qo'shmoq
count|v|sanamoq
measure|v|o'lchamoq
touch|v|tegmoq
smell|v|hid sezmoq
taste|v|tatib ko'rmoq
pass|v|o'tmoq, uzatmoq
share|v|bo'lishmoq
offer|v|taklif qilmoq
invite|v|taklif qilmoq (mehmonga)
thank|v|rahmat aytmoq
sorry|adj|kechirasiz, afsus
please|interj|iltimos
yes|interj|ha
no|interj|yo'q
hello|interj|salom
goodbye|interj|xayr
man|n|erkak
woman|n|ayol
boy|n|o'g'il bola
girl|n|qiz bola
child|n|bola
person|n|inson, shaxs
people|n|odamlar
family|n|oila
mother|n|ona
father|n|ota
sister|n|opa, singil
brother|n|aka, uka
son|n|o'g'il
daughter|n|qiz (farzand)
husband|n|er
wife|n|xotin
friend|n|do'st
baby|n|chaqaloq
grandmother|n|buvi
grandfather|n|bobo
uncle|n|amaki, tog'a
aunt|n|xola, amma
neighbor|n|qo'shni
teacher|n|o'qituvchi
student|n|talaba, o'quvchi
doctor|n|shifokor
driver|n|haydovchi
farmer|n|dehqon
worker|n|ishchi
shop|n|do'kon
market|n|bozor
house|n|uy
home|n|uy, vatan
room|n|xona
kitchen|n|oshxona
bathroom|n|hammom
bedroom|n|yotoqxona
door|n|eshik
window|n|deraza
wall|n|devor
floor|n|pol
roof|n|tom
garden|n|bog'
street|n|ko'cha
road|n|yo'l
city|n|shahar
village|n|qishloq
country|n|mamlakat
world|n|dunyo
school|n|maktab
university|n|universitet
hospital|n|kasalxona
library|n|kutubxona
bank|n|bank
mosque|n|masjid
station|n|bekat
airport|n|aeroport
hotel|n|mehmonxona
restaurant|n|restoran
park|n|bog', park
bridge|n|ko'prik
mountain|n|tog'
river|n|daryo
sea|n|dengiz
lake|n|ko'l
forest|n|o'rmon
field|n|dala
sun|n|quyosh
moon|n|oy
star|n|yulduz
sky|n|osmon
cloud|n|bulut
rain|n|yomg'ir
snow|n|qor
wind|n|shamol
fire|n|olov
water|n|suv
earth|n|yer
stone|n|tosh
tree|n|daraxt
flower|n|gul
grass|n|o't
animal|n|hayvon
dog|n|it
cat|n|mushuk
horse|n|ot
cow|n|sigir
sheep|n|qo'y
bird|n|qush
fish|n|baliq
food|n|ovqat
bread|n|non
rice|n|guruch
meat|n|go'sht
egg|n|tuxum
milk|n|sut
tea|n|choy
coffee|n|qahva
sugar|n|shakar
salt|n|tuz
fruit|n|meva
apple|n|olma
orange|n|apelsin
grape|n|uzum
vegetable|n|sabzavot
potato|n|kartoshka
onion|n|piyoz
tomato|n|pomidor
breakfast|n|nonushta
lunch|n|tushlik
dinner|n|kechki ovqat
cup|n|piyola
plate|n|likopcha
knife|n|pichoq
spoon|n|qoshiq
table|n|stol
chair|n|stul
bed|n|krovat
book|n|kitob
pen|n|ruchka
pencil|n|qalam
paper|n|qog'oz
bag|n|sumka
key|n|kalit
phone|n|telefon
computer|n|kompyuter
television|n|televizor
car|n|mashina
bus|n|avtobus
train|n|poyezd
plane|n|samolyot
bicycle|n|velosiped
ticket|n|chipta
money|n|pul
price|n|narx
gift|n|sovg'a
clothes|n|kiyim
shirt|n|ko'ylak
shoes|n|poyabzal
hat|n|shlyapa
coat|n|palto
body|n|tana
head|n|bosh
face|n|yuz
eye|n|ko'z
ear|n|quloq
nose|n|burun
mouth|n|og'iz
tooth|n|tish
hair|n|soch
hand|n|qo'l
arm|n|bilak
leg|n|oyoq
foot|n|oyoq kafti
heart|n|yurak
health|n|sog'liq
medicine|n|dori
pain|n|og'riq
time|n|vaqt
day|n|kun
night|n|tun
morning|n|ertalab
afternoon|n|tushdan keyin
evening|n|kech
week|n|hafta
month|n|oy (muddat)
year|n|yil
hour|n|soat
minute|n|daqiqa
second|n|soniya
today|n|bugun
tomorrow|n|ertaga
yesterday|n|kecha
weekend|n|dam olish kunlari
holiday|n|bayram
birthday|n|tug'ilgan kun
name|n|ism
word|n|so'z
sentence|n|gap
letter|n|harf, xat
number|n|raqam, son
page|n|sahifa
story|n|hikoya
song|n|qo'shiq
music|n|musiqa
picture|n|rasm
language|n|til
question|n|savol
idea|n|fikr, g'oya
problem|n|muammo
reason|n|sabab
way|n|yo'l, usul
life|n|hayot
job|n|ish, kasb
work|n|ish
office|n|idora
company|n|kompaniya
business|n|biznes
team|n|jamoa
lesson|n|dars
class|n|sinf, guruh
exam|n|imtihon
homework|n|uy vazifasi
news|n|yangilik
war|n|urush
peace|n|tinchlik
law|n|qonun
rule|n|qoida
history|n|tarix
culture|n|madaniyat
art|n|san'at
sport|n|sport
game|n|o'yin
football|n|futbol
voice|n|ovoz
dream|n|orzu, tush
secret|n|sir
truth|n|haqiqat
power|n|kuch
need|n|ehtiyoj
part|n|qism
place|n|joy
thing|n|narsa
side|n|tomon
end|n|oxir, tugash
group|n|guruh
point|n|nuqta
example|n|misol
mistake|n|xato
luck|n|omad
trip|n|sayohat
weather|n|ob-havo
color|n|rang
red|adj|qizil
blue|adj|ko'k
green|adj|yashil
yellow|adj|sariq
black|adj|qora
white|adj|oq
brown|adj|jigarrang
good|adj|yaxshi
bad|adj|yomon
big|adj|katta
small|adj|kichik
long|adj|uzun
short|adj|qisqa
tall|adj|baland (bo'y)
high|adj|baland
low|adj|past
wide|adj|keng
narrow|adj|tor
heavy|adj|og'ir
light|adj|yengil; yorug'
new|adj|yangi
old|adj|eski, keksa
young|adj|yosh
fast|adj|tez
slow|adj|sekin
hot|adj|issiq
cold|adj|sovuq
warm|adj|iliq
cool|adj|salqin
wet|adj|ho'l
dry|adj|quruq
clean|adj|toza
dirty|adj|iflos
easy|adj|oson
difficult|adj|qiyin
hard|adj|qattiq, qiyin
soft|adj|yumshoq
happy|adj|xursand
sad|adj|g'amgin
angry|adj|jahldor
tired|adj|charchagan
hungry|adj|och
thirsty|adj|chanqoq
sick|adj|kasal
healthy|adj|sog'lom
strong|adj|kuchli
weak|adj|zaif
rich|adj|boy
poor|adj|kambag'al
cheap|adj|arzon
expensive|adj|qimmat
beautiful|adj|chiroyli
ugly|adj|xunuk
kind|adj|mehribon
polite|adj|xushmuomala
clever|adj|aqlli
funny|adj|kulgili
quiet|adj|sokin
loud|adj|baland ovozli
busy|adj|band
free|adj|bo'sh, erkin
ready|adj|tayyor
safe|adj|xavfsiz
dangerous|adj|xavfli
important|adj|muhim
useful|adj|foydali
interesting|adj|qiziqarli
same|adj|bir xil
different|adj|boshqacha
right|adj|to'g'ri; o'ng
wrong|adj|noto'g'ri
true|adj|rost
false|adj|yolg'on
full|adj|to'la
empty|adj|bo'sh
open|adj|ochiq
closed|adj|yopiq
first|adj|birinchi
last|adj|oxirgi
next|adj|keyingi
other|adj|boshqa
many|det|ko'p (sanaladigan)
much|det|ko'p (sanalmaydigan)
some|det|bir oz, ba'zi
any|det|biror, har qanday
all|det|hamma
every|det|har bir
each|det|har bir (alohida)
both|det|ikkalasi
few|det|oz
more|adv|ko'proq
most|adv|eng ko'p
very|adv|juda
too|adv|ham; haddan ziyod
also|adv|shuningdek
just|adv|faqat, hozirgina
only|adv|faqat
still|adv|hali ham
already|adv|allaqachon
again|adv|yana
always|adv|doim
usually|adv|odatda
often|adv|tez-tez
sometimes|adv|ba'zan
never|adv|hech qachon
now|adv|hozir
then|adv|keyin, o'shanda
soon|adv|tez orada
here|adv|bu yerda
there|adv|u yerda
everywhere|adv|hamma joyda
together|adv|birga
alone|adv|yolg'iz
well|adv|yaxshi
maybe|adv|balki
really|adv|haqiqatan
quickly|adv|tezda
slowly|adv|sekin
one|num|bir
two|num|ikki
three|num|uch
four|num|to'rt
five|num|besh
six|num|olti
seven|num|yetti
eight|num|sakkiz
nine|num|to'qqiz
ten|num|o'n
twenty|num|yigirma
hundred|num|yuz
thousand|num|ming
million|num|million
half|num|yarim
`;

export const ENTRIES = RAW.trim().split('\n').map((line) => {
  const [word, pos, uz] = line.split('|');
  return { word, pos, uz };
});

export const POS_NAME = { n: 'ot', v: 'fe\'l', adj: 'sifat', adv: 'ravish', prep: 'predlog', pron: 'olmosh', conj: 'bog\'lovchi', det: 'aniqlovchi', num: 'son', interj: 'undov' };
