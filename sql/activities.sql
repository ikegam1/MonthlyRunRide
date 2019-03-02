create table activities(
	id int not null auto_increment,
	uuid text not null,
	sports_type varchar(12) not null default 'run',
	start_date datetime , 
	finish_date datetime ,
	rec_date datetime not null,
	km float not null,
	primary key(id)
)
